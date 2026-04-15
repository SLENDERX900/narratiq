import express from 'express'

const app = express()
const PORT = process.env.PORT || 3001

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT })
})

app.get('/api/watchlist', (req, res) => {
  res.json({ items: [] })
})

app.post('/api/watchlist', (req, res) => {
  res.json({ added: req.body })
})

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`)
})
