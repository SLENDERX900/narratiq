import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'

// Graceful imports - if any module fails, log error but don't crash
let insightsRouter, watchlistRouter, forecastRouter, runPipeline, catchUpIfMissed

async function loadModules() {
  try {
    insightsRouter = (await import('./routes/insights.js')).default
    console.log('[Startup] Insights router loaded')
  } catch (err) {
    console.error('[Startup] Failed to load insights router:', err.message)
  }

  try {
    watchlistRouter = (await import('./routes/watchlist.js')).default
    console.log('[Startup] Watchlist router loaded')
  } catch (err) {
    console.error('[Startup] Failed to load watchlist router:', err.message)
  }

  try {
    forecastRouter = (await import('./routes/forecast.js')).default
    console.log('[Startup] Forecast router loaded')
  } catch (err) {
    console.error('[Startup] Failed to load forecast router:', err.message)
  }

  try {
    const pipelineModule = await import('./lib/pipelineRunner.js')
    runPipeline = pipelineModule.runPipeline
    catchUpIfMissed = pipelineModule.catchUpIfMissed
    console.log('[Startup] Pipeline runner loaded')
  } catch (err) {
    console.error('[Startup] Failed to load pipeline runner:', err.message)
  }
}

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

// Real routes with AI agents - only load if modules loaded successfully
if (insightsRouter) {
  app.use('/api/insights', insightsRouter)
} else {
  app.get('/api/insights', (req, res) => {
    res.json({ error: 'Insights service unavailable' })
  })
}

if (watchlistRouter) {
  app.use('/api/watchlist', watchlistRouter)
} else {
  app.get('/api/watchlist', (req, res) => {
    res.json({ error: 'Watchlist service unavailable' })
  })
}

if (forecastRouter) {
  app.use('/api/forecast', forecastRouter)
} else {
  app.get('/api/forecast/:ticker', (req, res) => {
    res.json({ error: 'Forecast service unavailable' })
  })
}

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), cors: 'enabled' }))

app.post('/api/pipeline/run', async (req, res) => {
  res.json({ message: 'Pipeline triggered via POST' })
  if (runPipeline) {
    await runPipeline()
  } else {
    console.error('[Pipeline] Pipeline runner not available')
  }
})

// GET version for easy browser trigger
app.get('/api/pipeline/trigger', async (req, res) => {
  res.json({ message: 'Pipeline triggered via GET - check Runtime Logs' })
  if (runPipeline) {
    await runPipeline()
  } else {
    console.error('[Pipeline] Pipeline runner not available')
  }
})

// POST version for Railway cron (no auth required)
app.post('/api/pipeline/cron', async (req, res) => {
  console.log(`[Cron] Railway cron triggered at ${new Date().toISOString()}`)
  try {
    if (runPipeline) {
      await runPipeline()
      res.json({ message: 'Pipeline completed successfully' })
    } else {
      res.status(503).json({ error: 'Pipeline service unavailable' })
    }
  } catch (err) {
    console.error('[Cron] Pipeline failed:', err)
    res.status(500).json({ error: 'Pipeline failed', message: err.message })
  }
})

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\nNarratiQ server running on port ${PORT}`)
  
  // Load modules after server starts
  await loadModules()
  
  cron.schedule('0 * * * *', () => {
    console.log(`[Cron] Hourly trigger fired at ${new Date().toISOString()}`)
    if (runPipeline) {
      runPipeline().catch(err => console.error('[Cron] Pipeline failed:', err))
    } else {
      console.error('[Cron] Pipeline runner not available')
    }
  })
  
  try {
    if (catchUpIfMissed) {
      await catchUpIfMissed()
    } else {
      console.log('[Startup] Pipeline runner not available, skipping catch-up')
    }
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
