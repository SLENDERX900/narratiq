-- ============================================================
-- Schema Verification Queries
-- Run these to verify the NARRATIQ 2.0 migration
-- ============================================================

-- 1. Check vector extension is enabled
SELECT extname FROM pg_extension WHERE extname = 'vector';

-- 2. Check all tables exist
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- 3. Check policies exist
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;

-- 4. Check indexes exist
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;

-- 5. Check new NARRATIQ 2.0 tables specifically
SELECT 'assets' as table_name, COUNT(*) as row_count FROM public.assets
UNION ALL
SELECT 'market_sessions', COUNT(*) FROM public.market_sessions
UNION ALL
SELECT 'memory_logs', COUNT(*) FROM public.memory_logs
UNION ALL
SELECT 'knowledge_graph', COUNT(*) FROM public.knowledge_graph;

-- 6. Check vector index on memory_logs
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'memory_logs' AND indexname LIKE '%embedding%';

-- 7. Check match_memory_logs function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name = 'match_memory_logs';
