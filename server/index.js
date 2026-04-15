import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import { runPipeline, catchUpIfMissed } from './lib/pipelineRunner.js'
import insightsRouter  from './routes/insights.js'
import watchlistRouter from './routes/watchlist.js'
import forecastRouter  from './routes/forecast.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ 
  origin: ['https://narratiq-one.vercel.app', 'http://localhost:5173', process.env.CLIENT_URL].filter(Boolean),
  credentials: true
}))
app.use(express.json())

app.use('/api/insights',  insightsRouter)
app.use('/api/watchlist', watchlistRouter)
app.use('/api/forecast',  forecastRouter)

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

app.post('/api/pipeline/run', async (req, res) => {
  res.json({ message: 'Pipeline triggered' })
  await runPipeline()
})

app.listen(PORT, async () => {
  console.log(`\nNarratiQ server running on port ${PORT}`)
  cron.schedule('0 * * * *', () => {
    console.log('[Cron] Hourly trigger fired')
    runPipeline()
  })
  await catchUpIfMissed()
})
