import express from 'express'

const app = express()
const PORT = process.env.PORT || 5370

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT })
})

app.get('/api/watchlist', (req, res) => {
  res.json([])
})

app.post('/api/watchlist', (req, res) => {
  res.json({ added: req.body })
})

// Insights routes
app.get('/api/insights', (req, res) => {
  res.json([])
})

app.get('/api/insights/history', (req, res) => {
  res.json([])
})

// Forecast routes
app.get('/api/forecast/:ticker', (req, res) => {
  res.json({ ticker: req.params.ticker, forecast: null })
})

app.get('/api/forecast/accuracy', (req, res) => {
  res.json({})
})

app.get('/api/forecast/trust', (req, res) => {
  res.json({})
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on port ${PORT}`)
  console.log(`Environment PORT: ${process.env.PORT}`)
})

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})
