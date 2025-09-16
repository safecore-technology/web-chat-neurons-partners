import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY
const backendApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001'
const apiKey = process.env.REACT_APP_API_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration missing')
}

// Cliente Supabase para operações diretas (se necessário)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Configuração da API com chave para iframe
export const apiConfig = {
  baseURL: backendApiUrl,
  apiKey: apiKey,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  }
}

// Interceptor para adicionar API key em todas as requisições
export const apiClient = {
  async get(url, config = {}) {
    const response = await fetch(`${backendApiUrl}${url}?api_key=${apiKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...config.headers
      },
      ...config
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    return response.json()
  },

  async post(url, data, config = {}) {
    const response = await fetch(`${backendApiUrl}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...config.headers
      },
      body: JSON.stringify({ ...data, api_key: apiKey }),
      ...config
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    return response.json()
  },

  async put(url, data, config = {}) {
    const response = await fetch(`${backendApiUrl}${url}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...config.headers
      },
      body: JSON.stringify({ ...data, api_key: apiKey }),
      ...config
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    return response.json()
  },

  async delete(url, config = {}) {
    const response = await fetch(`${backendApiUrl}${url}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...config.headers
      },
      ...config
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    return response.json()
  }
}

export default apiClient