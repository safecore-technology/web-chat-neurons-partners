const axios = require('axios')

class EvolutionAPIService {
  constructor() {
    this.baseURL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
    this.apiKey = process.env.EVOLUTION_API_KEY

    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey
      },
      timeout: 30000
    })
  }

  // Pequeno util para aguardar entre tentativas
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Criar instância
  async createInstance(instanceName, webhookUrl) {
    try {
      // Primeiro, criar a instância com payload mínimo
      const createPayload = {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        token: instanceName,
        qrcode: true
      }
      
      console.log('Criando instância com payload:', JSON.stringify(createPayload, null, 2))
      const response = await this.api.post('/instance/create', createPayload)
      
      // Pequena espera inicial para a instância ficar disponível 
      console.log('⏳ Aguardando instância inicializar...')
      await this.sleep(1000)

      // Tentar configurar o webhook com retries (crucial para o app)
      if (webhookUrl) {
        const result = await this.setWebhookWithRetry(instanceName, webhookUrl)
        if (!result) {
          // não conseguiu configurar após tentativas, vamos limpar a instância e falhar
          try {
            console.warn('🗑️ Tentando limpar instância devido a falha no webhook...')
            await this.deleteInstance(instanceName)
          } catch (_) {}
          const err = new Error('Falha ao configurar webhook')
          err.reason = 'webhook'
          throw err
        }
      }
      
      return response.data
    } catch (error) {
      // Log estendido para facilitar debug
      const data = error.response?.data
      if (data) {
        try {
          console.error('Erro ao criar instância (detalhes):', JSON.stringify(data, null, 2))
        } catch (_) {
          console.error('Erro ao criar instância:', data)
        }
      } else {
        console.error('Erro ao criar instância:', error.message)
      }
      throw error
    }
  }

  // Conectar instância
  async connectInstance(instanceName) {
    try {
      const response = await this.api.get(`/instance/connect/${instanceName}`)
      return response.data
    } catch (error) {
      console.error(
        'Erro ao conectar instância:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Obter QR/Pairing via endpoint de conexão (retorna pairingCode/code)
  async getQRCode(instanceName) {
    try {
      const response = await this.api.get(`/instance/connect/${instanceName}`)
      return response.data
    } catch (error) {
      console.error(
        'Erro ao obter QR/Pairing:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Status da instância
  async getInstanceStatus(instanceName) {
    try {
      const response = await this.api.get(
        `/instance/connectionState/${instanceName}`
      )
      return response.data
    } catch (error) {
      console.error(
        'Erro ao obter status da instância:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Obter informações detalhadas da instância
  async getInstanceInfo(instanceName) {
    try {
      const response = await this.api.get(`/instance/fetchInstances?instanceName=${instanceName}`)
      // A API retorna um array, pegamos o primeiro item
      const instances = response.data
      if (instances && instances.length > 0) {
        const instanceData = instances[0]
        // Retornar dados estruturados da Evolution API
        return {
          id: instanceData.id,
          name: instanceData.name,
          connectionStatus: instanceData.connectionStatus,
          owner: instanceData.ownerJid,
          profileName: instanceData.profileName,
          profilePictureUrl: instanceData.profile_pic_url,
          integration: instanceData.integration,
          token: instanceData.token,
          businessId: instanceData.businessId,
          counts: instanceData._count || {},
          createdAt: instanceData.createdAt,
          updatedAt: instanceData.updatedAt,
          settings: instanceData.Setting
        }
      }
      return null
    } catch (error) {
      console.error(
        'Erro ao obter informações da instância:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Buscar todas as instâncias (mais eficiente para sincronização)
  async getAllInstances() {
    try {
      const response = await this.api.get('/instance/fetchInstances')
      return response.data || []
    } catch (error) {
      console.error(
        'Erro ao obter todas as instâncias:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Buscar configuração de webhook
  async findWebhook(instanceName) {
    const { data } = await this.api.get(`/webhook/find/${instanceName}`)
    return data
  }

  // Configurar webhook para uma instância
  async setWebhook(instanceName, webhookUrl, events = []) {
    try {
      const defaultEvents = [
        'APPLICATION_STARTUP',
        'QRCODE_UPDATED',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONTACTS_UPSERT',
        'CONTACTS_UPDATE',
        'PRESENCE_UPDATE',
        'CHATS_UPSERT',
        'CHATS_UPDATE',
        'CONNECTION_UPDATE'
      ]

      // Headers específicos para ngrok (evitar tela de greetings)
      const webhookHeaders = {};
      if (webhookUrl && webhookUrl.includes('ngrok')) {
        webhookHeaders['ngrok-skip-browser-warning'] = 'true';
        webhookHeaders['User-Agent'] = 'EvolutionAPI-Webhook/1.0';
      }

      // Importante: a Evolution API espera o payload sob a propriedade raiz "webhook"
      const payload = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          // Flags opcionais; alguns servidores aceitam camelCase
          webhookByEvents: true,
          webhookBase64: true,
          events: events.length > 0 ? events : defaultEvents,
          // Headers customizados para ngrok
          ...(Object.keys(webhookHeaders).length > 0 && { headers: webhookHeaders })
        }
      }

      console.log('Configurando webhook:', JSON.stringify(payload, null, 2))
      const response = await this.api.post(`/webhook/set/${instanceName}`, payload)
      return response.data
    } catch (error) {
      const data = error.response?.data
      if (data) {
        try {
          console.error('Erro ao configurar webhook (detalhes):', JSON.stringify(data, null, 2))
        } catch (_) {
          console.error('Erro ao configurar webhook:', data)
        }
      } else {
        console.error('Erro ao configurar webhook:', error.message)
      }
      throw error
    }
  }

  // Configurar webhook com tentativas e backoff
  async setWebhookWithRetry(instanceName, webhookUrl, maxAttempts = 6) {
    let attempt = 0
    let lastErr
    while (attempt < maxAttempts) {
      try {
        // Algumas instâncias precisam de um pequeno tempo para ficarem disponíveis
        if (attempt > 0) {
          const delay = Math.min(5000, 1000 * attempt) // 1s,2s,3s,4s,5s...
          console.log(`Aguardando ${delay}ms antes de tentar configurar o webhook (tentativa ${attempt + 1}/${maxAttempts})`)
          await this.sleep(delay)
        }

        // Opcional: checar se já há um webhook configurado
        try {
          const current = await this.findWebhook(instanceName)
          if (current?.enabled && current?.url) {
            console.log('Webhook já está configurado:', current)
            return current
          }
        } catch (_) {
          // Ignora 404/erros de find
        }

        const result = await this.setWebhook(instanceName, webhookUrl)
        console.log('✅ Webhook configurado com sucesso')
        return result
      } catch (err) {
        lastErr = err
        // Continua tentando em erros 400/404 que podem indicar indisponibilidade momentânea
        const status = err.response?.status
        if (status !== 400 && status !== 404 && status !== 409 && status !== 500) {
          // Erros não recuperáveis
          throw err
        }
        attempt += 1
      }
    }
    console.warn('⚠️ Não foi possível configurar o webhook após várias tentativas. Prosseguindo sem bloquear. Último erro:', lastErr?.response?.data || lastErr?.message)
    return null
  }

  // Logout da instância
  async logoutInstance(instanceName) {
    try {
      const response = await this.api.delete(`/instance/logout/${instanceName}`)
      return response.data
    } catch (error) {
      console.error(
        'Erro ao fazer logout:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Deletar instância
  async deleteInstance(instanceName) {
    try {
      const response = await this.api.delete(`/instance/delete/${instanceName}`)
      return response.data
    } catch (error) {
      console.error(
        'Erro ao deletar instância:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Enviar mensagem de texto
  async sendTextMessage(instanceName, number, message, quotedMessageId = null) {
    try {
      const data = {
        number,
        textMessage: {
          text: message
        }
      }

      if (quotedMessageId) {
        data.quoted = {
          key: {
            id: quotedMessageId
          }
        }
      }

      const response = await this.api.post(
        `/message/sendText/${instanceName}`,
        data
      )
      return response.data
    } catch (error) {
      console.error(
        'Erro ao enviar mensagem:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Enviar mídia
  async sendMediaMessage(
    instanceName,
    number,
    mediaPath,
    mediaType,
    caption = '',
    quotedMessageId = null
  ) {
    try {
      const data = {
        number,
        mediaMessage: {
          mediatype: mediaType,
          media: mediaPath,
          caption
        }
      }

      if (quotedMessageId) {
        data.quoted = {
          key: {
            id: quotedMessageId
          }
        }
      }

      const response = await this.api.post(
        `/message/sendMedia/${instanceName}`,
        data
      )
      return response.data
    } catch (error) {
      console.error(
        'Erro ao enviar mídia:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Obter contatos - API correta do Evolution
  async getContacts(instanceName) {
    try {
      const response = await this.api.post(`/chat/findContacts/${instanceName}`, {})
      return response.data
    } catch (error) {
      console.error(
        'Erro ao obter contatos:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Obter chats (otimizado - sem buscar fotos de perfil para evitar timeout)
  async getChats(instanceName) {
    try {
      // Buscar chats básicos sem fotos de perfil para melhorar performance
      const response = await this.api.post(`/chat/findChats/${instanceName}`, {
        where: {},
        limit: 50
      })

      const chats = response.data
      console.log(`📋 ${chats?.length || 0} chats obtidos da Evolution API`)
      
      return chats || []
    } catch (error) {
      console.error(
        'Erro ao obter chats:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Obter mensagens de um chat - API correta do Evolution
  async getChatMessages(instanceName, chatId, limit = 50) {
    try {
      const response = await this.api.post(`/chat/findMessages/${instanceName}`, {
        where: {
          key: {
            remoteJid: chatId
          }
        },
        limit: limit
      })
      return response.data
    } catch (error) {
      console.error(
        'Erro ao obter mensagens:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Marcar como lido
  async markAsRead(instanceName, chatId) {
    try {
      const response = await this.api.put(
        `/chat/markMessageAsRead/${instanceName}`,
        {
          readMessages: [
            {
              id: chatId,
              fromMe: false
            }
          ]
        }
      )
      return response.data
    } catch (error) {
      console.error(
        'Erro ao marcar como lido:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Definir presença (online, composing, recording, paused)
  async setPresence(instanceName, chatId, presence) {
    try {
      const response = await this.api.put(`/chat/presence/${instanceName}`, {
        number: chatId,
        presence
      })
      return response.data
    } catch (error) {
      console.error(
        'Erro ao definir presença:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Download de mídia
  async downloadMedia(instanceName, messageId) {
    try {
      const response = await this.api.get(
        `/message/downloadMedia/${instanceName}`,
        {
          params: { messageId },
          responseType: 'stream'
        }
      )
      return response.data
    } catch (error) {
      console.error(
        'Erro ao baixar mídia:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Não existe endpoint dedicado para perfil da instância na Evolution API.
  // Para obter informações de perfil (foto, nome, status) use getContactProfile
  // passando o número (phone) da instância quando disponível.

  // Obter perfil de um contato específico - API correta do Evolution
  async getContactProfile(instanceName, number) {
    try {
      const response = await this.api.post(`/chat/fetchProfile/${instanceName}`, {
        number: number
      })
      return response.data
    } catch (error) {
      console.error(
        'Erro ao obter perfil do contato:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Obter foto de perfil de um contato
  async getProfilePicture(instanceName, remoteJid) {
    try {
      const response = await this.api.get(`/chat/getProfilePicUrl/${instanceName}`, {
        params: {
          number: remoteJid
        }
      })
      
      return response.data?.profilePictureUrl || response.data?.url || null
    } catch (error) {
      // Se der 404 ou outro erro, não tem foto de perfil
      if (error.response?.status === 404) {
        return null
      }
      
      console.warn(
        `Erro ao obter foto de perfil para ${remoteJid}:`,
        error.response?.data || error.message
      )
      return null
    }
  }

  // Obter grupos do WhatsApp
  async getWhatsAppGroups(instanceName, getParticipants = false) {
    try {
      const response = await this.api.get(`/group/fetchAllGroups/${instanceName}`, {
        params: {
          getParticipants
        }
      })
      return response.data
    } catch (error) {
      console.error(
        'Erro ao obter grupos:',
        error.response?.data || error.message
      )
      throw error
    }
  }

  // Buscar contatos específicos com filtro
  async findSpecificContacts(instanceName, contactId = null) {
    try {
      const body = contactId ? { where: { id: contactId } } : {}
      const response = await this.api.post(`/chat/findContacts/${instanceName}`, body)
      return response.data
    } catch (error) {
      console.error(
        'Erro ao buscar contatos específicos:',
        error.response?.data || error.message
      )
      throw error
    }
  }


}

module.exports = new EvolutionAPIService()
