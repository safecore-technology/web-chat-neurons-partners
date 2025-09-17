import axios from 'axios'

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001'
const API_KEY = process.env.REACT_APP_API_KEY

// Criar instância do axios
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000, // Aumentado para 90 segundos para evitar timeouts em grandes sincronizações
  headers: {
    'Content-Type': 'application/json'
  }
})

// Interceptor para adicionar API Key para iframe ou JWT token
api.interceptors.request.use(
  config => {
    // Priorizar API Key para iframe
    if (API_KEY) {
      config.headers['x-api-key'] = API_KEY
      // Também adicionar como query parameter como fallback
      config.params = { ...config.params, api_key: API_KEY }
    } else {
      // Fallback para JWT se não tiver API Key
      const token = localStorage.getItem('whatsapp_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// Interceptor para tratar respostas e erros
api.interceptors.response.use(
  response => {
    return response
  },
  error => {
    if (error.response?.status === 401) {
      // Token inválido ou expirado
      localStorage.removeItem('whatsapp_token')
      localStorage.removeItem('whatsapp_user')
      window.location.href = '/login'
    }

    // Log do erro para debug
    if (process.env.REACT_APP_DEBUG === 'true') {
      console.error('API Error:', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        data: error.response?.data
      })
    }

    return Promise.reject(error)
  }
)

class ApiService {
  // Métodos genéricos HTTP
  async get(url, config = {}) {
    const response = await api.get(url, config)
    return response.data
  }

  async post(url, data = {}, config = {}) {
    const response = await api.post(url, data, config)
    return response.data
  }

  async put(url, data = {}, config = {}) {
    const response = await api.put(url, data, config)
    return response.data
  }

  async delete(url, config = {}) {
    const response = await api.delete(url, config)
    return response.data
  }

  // Autenticação
  async login(credentials) {
    const response = await api.post('/api/auth/login', credentials)
    return response.data
  }

  async verifyToken() {
    const response = await api.get('/api/auth/verify')
    return response.data
  }

  async changePassword(passwords) {
    const response = await api.put('/api/auth/change-password', passwords)
    return response.data
  }

  // Usuários (admin)
  async getUsers() {
    const response = await api.get('/api/auth/users')
    return response.data
  }

  async createUser(userData) {
    const response = await api.post('/api/auth/users', userData)
    return response.data
  }

  async toggleUserStatus(userId, isActive) {
    const response = await api.put(`/api/auth/users/${userId}/toggle-status`, {
      isActive
    })
    return response.data
  }

  // Instâncias
  async getInstances() {
    const response = await api.get('/api/instances')
    return response.data
  }

  async createInstance(instanceData) {
    const response = await api.post('/api/instances', instanceData)
    return response.data
  }

  async getInstance(instanceId) {
    const response = await api.get(`/api/instances/${instanceId}`)
    return response.data
  }

  async connectInstance(instanceId) {
    const response = await api.post(`/api/instances/${instanceId}/connect`)
    return response.data
  }

  async getQRCode(instanceId) {
    const response = await api.get(`/api/instances/${instanceId}/qrcode`)
    return response.data
  }

  async getInstanceStatus(instanceId) {
    const response = await api.get(`/api/instances/${instanceId}/status`)
    return response.data
  }

  async disconnectInstance(instanceId) {
    const response = await api.post(`/api/instances/${instanceId}/disconnect`)
    return response.data
  }

  async deleteInstance(instanceId) {
    const response = await api.delete(`/api/instances/${instanceId}`)
    return response.data
  }

  async getProfileInfo(instanceId) {
    const response = await api.get(`/api/instances/${instanceId}/profile`)
    return response.data
  }

  async getContacts(instanceId) {
    const response = await api.get(`/api/instances/${instanceId}/contacts`)
    return response.data
  }

  async checkWebhook(instanceId) {
    console.log('🔍 ApiService.checkWebhook chamado com instanceId:', instanceId)
    console.log('📡 URL da requisição:', `/api/instances/${instanceId}/webhook`)
    const response = await api.get(`/api/instances/${instanceId}/webhook`)
    return response.data
  }

  async recreateInstance(instanceId) {
    const response = await api.post(`/api/instances/${instanceId}/recreate`)
    return response.data
  }

  async syncInstanceData(instanceId) {
    const response = await api.post(`/api/instances/${instanceId}/sync`)
    return response.data
  }

  // Chats
  async getChats(instanceId) {
    try {
      // Buscar chats direto da Evolution API para tempo real
      const response = await api.get(`/api/${instanceId}/chats/findChats`)
      return response.data
    } catch (error) {
      console.error('Erro ao buscar chats:', error)
      // Fallback para API local se falhar
      const fallbackResponse = await api.get(`/api/${instanceId}/chats`)
      return fallbackResponse.data
    }
  }

  async syncChats(instanceId) {
    // Configuração específica para permitir timeout maior na sincronização
    const response = await api.post(`/api/${instanceId}/chats/sync`, {}, {
      timeout: 120000 // 2 minutos para sincronização
    })
    return response.data
  }

  async getChat(instanceId, chatId) {
    const response = await api.get(`/api/${instanceId}/chats/${chatId}`)
    return response.data
  }

  async markAsRead(instanceId, chatId) {
    const response = await api.put(`/api/${instanceId}/chats/${chatId}/read`)
    return response.data
  }

  async toggleArchive(instanceId, chatId) {
    const response = await api.put(`/api/${instanceId}/chats/${chatId}/archive`)
    return response.data
  }

  async togglePin(instanceId, chatId) {
    const response = await api.put(`/api/${instanceId}/chats/${chatId}/pin`)
    return response.data
  }

  async setPresence(instanceId, chatId, presence) {
    const response = await api.post(`/api/${instanceId}/chats/${chatId}/presence`, {
      presence
    })
    return response.data
  }

  // Mensagens
  async getMessages(instanceId, chatId, params = {}) {
    // Log para debug
    console.log(`📱 API: getMessages para instância ${instanceId}, chat ${chatId}`);
    
    try {
      const response = await api.get(`/api/${instanceId}/chats/${chatId}/messages`, {
        params
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Erro ao obter mensagens: ${error.message}`, {
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  async syncMessages(instanceId, chatId, params = {}) {
    const response = await api.post(
      `/api/${instanceId}/chats/${chatId}/messages/sync`,
      params
    )
    return response.data
  }

  async sendTextMessage(instanceId, chatId, messageData) {
    const response = await api.post(
      `/api/${instanceId}/chats/${chatId}/messages/text`,
      messageData
    )
    return response.data
  }

  async sendMediaMessage(instanceId, chatId, formData) {
    const response = await api.post(
      `/api/${instanceId}/chats/${chatId}/messages/media`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    )
    return response.data
  }

  async searchMessages(instanceId, params = {}) {
    const response = await api.get(`/api/${instanceId}/messages/search`, { params })
    return response.data
  }

  async downloadMedia(instanceId, messageId) {
    const response = await api.get(
      `/api/${instanceId}/messages/${messageId}/media`,
      {
        responseType: 'blob'
      }
    )
    return response.data
  }

  async deleteMessage(instanceId, messageId) {
    const response = await api.delete(`/api/${instanceId}/messages/${messageId}`)
    return response.data
  }

  // Dashboard
  async getDashboardStats() {
    const response = await api.get('/api/dashboard/stats')
    return response.data
  }

  async getConnectedUsers() {
    const response = await api.get('/api/dashboard/connected-users')
    return response.data
  }

  async getActivity(params = {}) {
    const response = await api.get('/api/dashboard/activity', { params })
    return response.data
  }

  async getHealthCheck() {
    const response = await api.get('/api/dashboard/health')
    return response.data
  }

  async getUsageReport(params = {}) {
    const response = await api.get('/api/dashboard/usage-report', { params })
    return response.data
  }

  // Utilitários
  getMediaUrl(instanceId, messageId) {
    const token = localStorage.getItem('whatsapp_token')
    return `${API_BASE_URL}/${instanceId}/messages/${messageId}/media?token=${token}`
  }

  getUploadUrl() {
    return `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/uploads`
  }
}

// Exportar instância única
const apiService = new ApiService()
export default apiService

// Exportar também a instância do axios para uso avançado
export { api }
