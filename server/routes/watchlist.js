import { Router } from 'express'
import { supabase } from '../config/supabase.js'

const router = Router()

// Middleware: extract user from Supabase JWT
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  req.user = user
  next()
}

// GET /api/watchlist
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_watchlist')
    .select('ticker, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/watchlist
router.post('/', requireAuth, async (req, res) => {
  const ticker = req.body.ticker?.toUpperCase().trim()
  if (!ticker) return res.status(400).json({ error: 'Ticker required' })

  const { data, error } = await supabase
    .from('user_watchlist')
    .insert({ user_id: req.user.id, ticker })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ticker already in watchlist' })
    return res.status(500).json({ error: error.message })
  }
  res.status(201).json(data)
})

// DELETE /api/watchlist/:ticker
router.delete('/:ticker', requireAuth, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase()
  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', req.user.id)
    .eq('ticker', ticker)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
