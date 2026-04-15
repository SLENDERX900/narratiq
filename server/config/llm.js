import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { llmProviders } from './apis.js'

const openaiClients = {}

function getOpenAIClient(provider) {
  if (!openaiClients[provider.name]) {
    openaiClients[provider.name] = new OpenAI({
      baseURL: provider.baseURL,
      apiKey: provider.key,
    })
  }
  return openaiClients[provider.name]
}

export async function callLLM({ tier = 'fast', messages, providerIndex = 0 }) {
  const provider = llmProviders[providerIndex]
  if (!provider) throw new Error('All LLM providers exhausted')

  try {
    if (provider.name === 'gemini') {
      const genai = new GoogleGenerativeAI(provider.key)
      const model = genai.getGenerativeModel({ model: provider.models[tier] })
      const prompt = messages.map(m => m.content).join('\n')
      const result = await model.generateContent(prompt)
      return result.response.text()
    }

    const client = getOpenAIClient(provider)
    const res = await client.chat.completions.create({
      model: provider.models[tier],
      messages,
      max_tokens: 1000,
      temperature: 0.3,
    })
    return res.choices[0].message.content

  } catch (err) {
    console.error(`[LLM] ${provider.name} failed (${err.message}), trying next provider`)
    return callLLM({ tier, messages, providerIndex: providerIndex + 1 })
  }
}
