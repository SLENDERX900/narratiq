import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 8080

// 1. ABSOLUTE FIRST: Handle CORS before anything else blocks the thread
app.use(cors({
  origin: ['https://narratiq-one.vercel.app', 'https://narratiq-l7g3k59gw-stuarttgregory04-4577s-projects.vercel.app', 'http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// 2. EXPLICIT PREFLIGHT HANDLING (Railway Safety)
app.options('*', cors())

// 3. BODY PARSERS
app.use(express.json())

// 4. INSTANT HEALTH CHECK (To prevent Railway 502s)
app.get('/test-cors', (req, res) => {
  res.status(200).json({ status: "ok", message: "CORS and Server are alive." });
})

app.get('/health', (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is healthy", port: PORT });
})

// 5. LAZY LOAD HEAVY LOGIC - Import routes AFTER middleware
import insightsRouter  from './routes/insights.js'
import watchlistRouter from './routes/watchlist.js'
import forecastRouter  from './routes/forecast.js'

app.use('/api/insights', insightsRouter)
app.use('/api/watchlist', watchlistRouter)
app.use('/api/forecast', forecastRouter)

// Pipeline endpoints
app.post('/api/pipeline/run', async (req, res) => {
  res.json({ message: 'Pipeline triggered via POST' })
  const { runPipeline } = await import('./lib/pipelineRunner.js')
  await runPipeline()
})

app.get('/api/pipeline/trigger', async (req, res) => {
  res.json({ message: 'Pipeline triggered via GET - check Runtime Logs' })
  const { runPipeline } = await import('./lib/pipelineRunner.js')
  await runPipeline()
})

app.post('/api/pipeline/cron', async (req, res) => {
  console.log(`[Cron] Railway cron triggered at ${new Date().toISOString()}`)
  try {
    const { runPipeline } = await import('./lib/pipelineRunner.js')
    await runPipeline()
    res.json({ message: 'Pipeline completed successfully' })
  } catch (err) {
    console.error('[Cron] Pipeline failed:', err)
    res.status(500).json({ error: 'Pipeline failed', message: err.message })
  }
})

// 6. RAILWAY BINDING
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // Initialize heavy AI agents asynchronously AFTER the server is listening
  initializeHeavyLogic().catch(console.error);
});

// Lazy initialization of heavy logic
async function initializeHeavyLogic() {
  console.log('🔄 Initializing heavy AI logic...');
  try {
    // Import and initialize heavy modules here
    const cron = (await import('node-cron')).default;
    const { runPipeline, catchUpIfMissed } = await import('./lib/pipelineRunner.js');
    
    // Setup cron job
    cron.schedule('0 * * * *', () => {
      console.log(`[Cron] Hourly trigger fired at ${new Date().toISOString()}`);
      runPipeline().catch(err => console.error('[Cron] Pipeline failed:', err));
    });
    
    // Optional: catch up missed runs (commented out to prevent startup crashes)
    // await catchUpIfMissed();
    
    console.log('✅ Heavy AI logic initialized successfully');
  } catch (err) {
    console.error('❌ Failed to initialize heavy logic:', err.message);
  }
}

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})
