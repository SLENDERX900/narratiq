import axios from 'axios'

// Creates an axios instance with automatic provider rotation on 429/503
export function createRobustClient(providers) {
  let currentIndex = 0

  const client = axios.create({ timeout: 10000 })

  client.interceptors.response.use(
    res => res,
    async err => {
      const status = err.response?.status
      const isRetryable = status === 429 || status === 503 || !err.response

      if (isRetryable && currentIndex < providers.length - 1) {
        currentIndex++
        const next = providers[currentIndex]
        console.warn(`[HealthMonitor] Rotating to provider: ${next.name} (status ${status})`)

        const config = err.config
        // Patch the URL base for the retry
        if (next.baseURL) {
          config.url = config.url.replace(
            providers[currentIndex - 1].baseURL,
            next.baseURL
          )
          config.baseURL = next.baseURL
        }
        // Swap the API key param/header
        if (next.key) {
          if (config.params?.token) config.params.token = next.key
          if (config.params?.apikey) config.params.apikey = next.key
          if (config.headers?.['APCA-API-KEY-ID']) {
            config.headers['APCA-API-KEY-ID'] = next.key
            config.headers['APCA-API-SECRET-KEY'] = next.secret || ''
          }
        }
        return client.request(config)
      }

      return Promise.reject(err)
    }
  )

  return { client, getProvider: () => providers[currentIndex] }
}
