const { SupabaseInstance, SupabaseContact, SupabaseChat, SupabaseMessage } = require('../models/supabase')
const { getIO, emitSyncStart, emitSyncProgress, emitSyncComplete } = require('../services/socket')
const evolutionApi = require('../services/evolutionApi')
const redisService = require('../config/redis')

class WebhookController {
  constructor() {
    // Bind methods to ensure correct 'this' context
    this.handleWebhook = this.handleWebhook.bind(this)
    this.handleQRCodeUpdate = this.handleQRCodeUpdate.bind(this)
    this.handleConnectionUpdate = this.handleConnectionUpdate.bind(this)
    this.handleMessagesUpsert = this.handleMessagesUpsert.bind(this)
    this.handleMessagesUpdate = this.handleMessagesUpdate.bind(this)
    this.handleContactsUpdate = this.handleContactsUpdate.bind(this)
    this.handleChatsUpdate = this.handleChatsUpdate.bind(this)
    this.handlePresenceUpdate = this.handlePresenceUpdate.bind(this)
  }

  // Processar webhooks do Evolution API
  async handleWebhook(req, res) {
    try {
      // Adicionar headers para ngrok (evitar tela de greetings)
      res.setHeader('ngrok-skip-browser-warning', 'true');
      res.setHeader('User-Agent', 'WppWeb-Webhook/1.0');

      const { instanceName } = req.params
      const eventData = req.body

      console.log(`📥 WEBHOOK RECEBIDO - Instância: ${instanceName}`)
      console.log(`📥 Evento: ${eventData.event}`)
      // Clone the data and suppress large base64 string
      const logData = JSON.parse(JSON.stringify(eventData.data || {}));
      if (logData.qrcode && logData.qrcode.base64) {
        logData.qrcode.base64 = '[BASE64_QR_CODE_SUPPRESSED]';
      }
      console.log(`📥 Dados:`, JSON.stringify(logData, null, 2));

      // Encontrar instância pelo Evolution ID
      const instance = await SupabaseInstance.findByEvolutionId(instanceName)

      if (!instance) {
        console.warn(`⚠️  Webhook recebido para instância desconhecida: ${instanceName}`)
        console.warn(`⚠️  Isso pode indicar instâncias criadas fora do sistema`)
        console.warn(`⚠️  Respondendo 200 OK para evitar spam de tentativas`)
        return res.status(200).json({ 
          success: true, 
          message: 'Webhook recebido mas instância não está no banco de dados' 
        })
      }

      const io = getIO()

      // Processar diferentes tipos de eventos
      const evt = (eventData.event || '').toUpperCase().replace('.', '_')
      console.log(`🔄 Evento normalizado: "${eventData.event}" → "${evt}"`)
      
      switch (evt) {
        case 'QRCODE_UPDATED':
          await this.handleQRCodeUpdate(instance, eventData, io)
          break

        case 'CONNECTION_UPDATE':
          await this.handleConnectionUpdate(instance, eventData, io)
          break

        case 'MESSAGES_UPSERT':
          await this.handleMessagesUpsert(instance, eventData, io)
          break

        case 'MESSAGES_UPDATE':
          await this.handleMessagesUpdate(instance, eventData, io)
          break

        case 'CONTACTS_UPSERT':
        case 'CONTACTS_UPDATE':
          await this.handleContactsUpdate(instance, eventData, io)
          break

        case 'CHATS_UPSERT':
        case 'CHATS_UPDATE':
          await this.handleChatsUpdate(instance, eventData, io)
          break

        case 'PRESENCE_UPDATE':
          await this.handlePresenceUpdate(instance, eventData, io)
          break

        case 'APPLICATION_STARTUP':
          console.log('⚙️ Evolution API iniciou e confirmou webhook ativo')
          break

        default:
          console.log(`Evento não processado: ${eventData.event}`)
      }

      res.status(200).json({ success: true })
    } catch (error) {
      console.error('Erro ao processar webhook:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Atualizar QR Code
  async handleQRCodeUpdate(instance, eventData, io) {
    try {
      const qrData = eventData.data?.qrcode
      if (!qrData) return

      console.log('📱 Atualizando QR Code...')
      
      // Atualizar instância no banco
      await SupabaseInstance.update(instance.id, {
        status: 'qr_code',
        qr_code: qrData.code,
        updated_at: new Date().toISOString()
      })

      // Emitir para frontend via Socket.IO
      io.to(`instance_${instance.id}`).emit('qrcode_updated', {
        instanceId: instance.id,
        qrCode: qrData.code,
        qrCodeBase64: qrData.base64
      })

      console.log('✅ QR Code atualizado')
    } catch (error) {
      console.error('Erro ao atualizar QR Code:', error)
    }
  }

  // Atualizar status de conexão
  async handleConnectionUpdate(instance, eventData, io) {
    try {
      const connectionData = eventData.data?.connection
      if (!connectionData) return

      console.log('🔌 Atualizando status de conexão:', connectionData.state)
      
      let status = 'disconnected'
      let profileName = null
      let phone = null

      switch (connectionData.state) {
        case 'open':
          status = 'connected'
          // Tentar extrair informações do número
          if (connectionData.instance?.profileName) {
            profileName = connectionData.instance.profileName
          }
          if (connectionData.instance?.ownerJid) {
            phone = connectionData.instance.ownerJid.replace('@s.whatsapp.net', '')
          }
          break
        case 'connecting':
          status = 'connecting'
          break
        case 'close':
        default:
          status = 'disconnected'
          break
      }

      // Atualizar no banco
      const updateData = {
        status,
        updated_at: new Date().toISOString()
      }
      
      if (profileName) updateData.profile_name = profileName
      if (phone) updateData.phone = phone

      await SupabaseInstance.update(instance.id, updateData)

      // Emitir para frontend
      io.to(`instance_${instance.id}`).emit('connection_update', {
        instanceId: instance.id,
        status,
        profileName,
        phone
      })

      console.log(`✅ Status de conexão atualizado: ${status}`)

      // Se a instância foi conectada, iniciar sincronização automática
      if (status === 'connected') {
        console.log(`🚀 Instância conectada, iniciando sincronização automática: ${instance.id}`)
        // Aguardar um pouco para estabilizar a conexão
        setTimeout(async () => {
          try {
            const ChatController = require('./ChatController')
            await ChatController.syncChats({ params: { instanceId: instance.id }, user: { role: 'admin' } }, { json: () => {} })
            console.log(`✅ Sincronização automática concluída para instância: ${instance.id}`)
          } catch (syncError) {
            console.error(`❌ Erro na sincronização automática para instância ${instance.id}:`, syncError.message)
          }
        }, 3000) // Aguardar 3 segundos para estabilizar
      }
    } catch (error) {
      console.error('Erro ao atualizar conexão:', error)
    }
  }

  // Processar novas mensagens
  async handleMessagesUpsert(instance, eventData, io) {
    try {
      const messages = eventData.data?.messages || []
      if (!Array.isArray(messages) || messages.length === 0) return

      console.log(`💬 Processando ${messages.length} mensagem(ns)...`)

      for (const msg of messages) {
        await this.processMessage(instance, msg, io)
      }
    } catch (error) {
      console.error('Erro ao processar mensagens:', error)
    }
  }

  // Processar uma mensagem individual  
  async processMessage(instance, msg, io) {
    try {
      // Log mais detalhado da mensagem
      console.log(`📝 Processando mensagem - ID: ${msg.key?.id}, From: ${msg.key?.remoteJid}, FromMe: ${msg.key?.fromMe}`)
      console.log(`💬 Timestamp: ${msg.messageTimestamp}, Type: ${this.getMessageType(msg.message)}`)
      
      // TODO: Implementar salvamento completo no Supabase
      // Por enquanto apenas processamento básico
      
      // Emitir mensagem via Socket.IO para frontend
      console.log(`🔔 Emitindo evento message_received para instance_${instance.id}`)
      io.to(`instance_${instance.id}`).emit('message_received', {
        instanceId: instance.id,
        message: msg
      })
      
    } catch (error) {
      console.error('Erro ao processar mensagem:', error)
    }
  }
  
  // Helper para determinar tipo da mensagem
  getMessageType(message) {
    if (!message) return 'unknown';
    
    if (message.conversation) return 'text';
    if (message.extendedTextMessage) return 'text';
    if (message.imageMessage) return 'image';
    if (message.videoMessage) return 'video';
    if (message.audioMessage) return 'audio';
    if (message.documentMessage) return 'document';
    if (message.stickerMessage) return 'sticker';
    if (message.locationMessage) return 'location';
    if (message.contactMessage) return 'contact';
    
    return Object.keys(message)[0] || 'unknown';
  }

  // Atualizar status de mensagens
  async handleMessagesUpdate(instance, eventData, io) {
    try {
      console.log('📤 Atualizando status de mensagens...')
      
      const updates = eventData.data?.updates || []
      for (const update of updates) {
        console.log(`📋 Status atualizado - ID: ${update.key?.id}, Status: ${update.update?.status}`)
        
        // Emitir atualização via Socket.IO
        io.to(`instance_${instance.id}`).emit('message_status_update', {
          instanceId: instance.id,
          messageId: update.key?.id,
          status: update.update?.status
        })
      }
    } catch (error) {
      console.error('Erro ao atualizar mensagens:', error)
    }
  }

  // Atualizar contatos
  async handleContactsUpdate(instance, eventData, io) {
    try {
      console.log('👥 Atualizando contatos...')
      
      const contacts = eventData.data?.contacts || []
      console.log(`📋 ${contacts.length} contato(s) para processar`)
      
      // TODO: Implementar salvamento de contatos no Supabase
      
      // Emitir atualização via Socket.IO
      io.to(`instance_${instance.id}`).emit('contacts_updated', {
        instanceId: instance.id,
        count: contacts.length
      })
      
    } catch (error) {
      console.error('Erro ao atualizar contatos:', error)
    }
  }

  // Atualizar chats
  async handleChatsUpdate(instance, eventData, io) {
    try {
      console.log('💬 Atualizando chats...')
      
      const chats = eventData.data?.chats || []
      console.log(`📋 ${chats.length} chat(s) para processar`)
      
      // TODO: Implementar salvamento de chats no Supabase
      
      // Emitir atualização via Socket.IO
      io.to(`instance_${instance.id}`).emit('chats_updated', {
        instanceId: instance.id,
        count: chats.length
      })
      
    } catch (error) {
      console.error('Erro ao atualizar chats:', error)
    }
  }

  // Atualizar presença
  async handlePresenceUpdate(instance, eventData, io) {
    try {
      console.log('👀 Atualizando presença...')
      
      const presence = eventData.data?.presence
      if (presence) {
        console.log(`📋 Presença: ${presence.from} - ${presence.presences?.[0]?.presence}`)
        
        // Emitir atualização via Socket.IO
        io.to(`instance_${instance.id}`).emit('presence_updated', {
          instanceId: instance.id,
          from: presence.from,
          presence: presence.presences?.[0]?.presence
        })
      }
    } catch (error) {
      console.error('Erro ao atualizar presença:', error)
    }
  }
}

module.exports = new WebhookController()