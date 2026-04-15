import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'
import { runPipeline, catchUpIfMissed } from './lib/pipelineRunner.js'
import insightsRouter  from './routes/insights.js'
import watchlistRouter from './routes/watchlist.js'
import forecastRouter  from './routes/forecast.js'

const app = express()
const PORT = process.env.PORT || 3001

// CORS - MUST be before express.json()
app.use((req, res, next) => {
  const allowedOrigins = ['https://narratiq-one.vercel.app', 'https://narratiq-l7g3k59gw-stuarttgregory04-4577s-projects.vercel.app', 'http://localhost:5173']
  const origin = req.headers.origin
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  res.header('Access-Control-Allow-Credentials', 'true')
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

app.use(express.json())

// Test endpoint
app.get('/test-cors', (req, res) => {
  res.json({ message: 'CORS is working', origin: req.headers.origin })
})

// Real routes with AI agents
app.use('/api/insights',  insightsRouter)
app.use('/api/watchlist', watchlistRouter)
app.use('/api/forecast',  forecastRouter)

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), cors: 'enabled' }))

app.post('/api/pipeline/run', async (req, res) => {
  res.json({ message: 'Pipeline triggered' })
  await runPipeline()
})

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\nNarratiQ server running on port ${PORT}`)
  cron.schedule('0 * * * *', () => {
    console.log('[Cron] Hourly trigger fired')
    runPipeline()
  })
  try {
    await catchUpIfMissed()
  } catch (err) {
    console.error('[Startup] catchUpIfMissed failed:', err.message)
  }
})

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})
