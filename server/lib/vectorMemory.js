import { supabase } from '../config/supabase.js'

function ensureEmbedding(queryEmbedding) {
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    throw new Error('queryEmbedding must be a non-empty array')
  }

  const normalized = queryEmbedding.map((value) => Number(value))

  if (normalized.some((value) => !Number.isFinite(value))) {
    throw new Error('queryEmbedding must contain only numeric values')
  }

  return normalized
}

function normalizeLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

export async function getHistoricalContext({
  queryEmbedding,
  assetId = null,
  memoryType = null,
  matchCount = 5,
} = {}) {
  const embedding = ensureEmbedding(queryEmbedding)

  const { data, error } = await supabase.rpc('match_memory_logs', {
    query_embedding: embedding,
    match_count: normalizeLimit(matchCount, 5),
    filter_asset_id: assetId,
    filter_memory_type: memoryType,
  })

  if (error) {
    throw new Error(`match_memory_logs failed: ${error.message}`)
  }

  return Array.isArray(data) ? data : []
}

export async function getRelatedAssets({
  assetId,
  relationTypes = ['sector_mate', 'supplier', 'customer', 'peer', 'supply_chain'],
  limit = 10,
} = {}) {
  if (!assetId) {
    throw new Error('assetId is required')
  }

  const cleanRelationTypes = Array.isArray(relationTypes) && relationTypes.length > 0
    ? relationTypes
    : ['sector_mate', 'supplier', 'customer', 'peer', 'supply_chain']

  const safeLimit = normalizeLimit(limit, 10)

  const { data, error } = await supabase
    .from('knowledge_graph')
    .select(`
      id,
      source_asset_id,
      related_asset_id,
      relation_type,
      weight,
      evidence,
      metadata,
      created_at,
      updated_at,
      related_asset:assets!knowledge_graph_related_asset_id_fkey (
        id,
        symbol,
        name,
        asset_type,
        exchange,
        sector,
        industry,
        is_active,
        metadata
      )
    `)
    .eq('source_asset_id', assetId)
    .in('relation_type', cleanRelationTypes)
    .order('weight', { ascending: false })
    .limit(safeLimit)

  if (error) {
    throw new Error(`knowledge_graph query failed: ${error.message}`)
  }

  return Array.isArray(data) ? data : []
}

export async function getFullContext({
  queryEmbedding,
  assetId,
  memoryType = null,
  matchCount = 5,
  relationTypes,
  relatedLimit = 10,
} = {}) {
  const [historicalContext, relatedAssets] = await Promise.all([
    getHistoricalContext({
      queryEmbedding,
      assetId,
      memoryType,
      matchCount,
    }),
    getRelatedAssets({
      assetId,
      relationTypes,
      limit: relatedLimit,
    }),
  ])

  return {
    historical_context: historicalContext,
    related_assets: relatedAssets,
  }
}

