const { SupabaseChat, SupabaseContact, SupabaseMessage, SupabaseInstance } = require('../models/supabase')
// Aliases for compatibility
const Instance = SupabaseInstance
const Chat = SupabaseChat
const Contact = SupabaseContact
const Message = SupabaseMessage
const evolutionApi = require('../services/evolutionApi')
const socketService = require('../services/socket')
const redisService = require('../config/redis')
const { emitSyncProgress, emitSyncStart, emitSyncComplete } = require('../services/socket')

class ChatController {
  // Obter lista de chats
  async getChats(req, res) {
    try {
      const { instanceId } = req.params
      const { page = 1, limit = 50, search = '' } = req.query

      // Evitar consultas inválidas
      if (!instanceId || instanceId === 'undefined') {
        return res.status(400).json({ error: 'Parâmetro instanceId inválido' })
      }

      // Verificar se o usuário tem acesso à instância (se não for autenticação via API)
      if (req.user?.role !== 'admin' && req.user?.id) {
        const instance = await Instance.findById(instanceId)
        if (!instance || instance.user_id !== req.user.id) {
          return res.status(404).json({ error: 'Instância não encontrada' })
        }
      }

      const offset = (page - 1) * limit

      // Buscar chats da instância
      let chats = await Chat.findByInstance(instanceId, {
        limit: parseInt(limit),
        offset
      })

      // Filtrar por busca se necessário
      if (search && chats.length > 0) {
        const searchLower = search.toLowerCase()
        chats = chats.filter(chat => {
          const contact = chat.contacts
          if (!contact) return false
          
          return (
            contact.name?.toLowerCase().includes(searchLower) ||
            contact.push_name?.toLowerCase().includes(searchLower) ||
            contact.phone?.includes(search)
          )
        })
      }

      // Contar total para paginação
      const totalChats = await Chat.count(instanceId)

      // Transformar dados para o formato esperado pelo frontend
      const transformedChats = chats.map(chat => {
        const contact = chat.contacts || {}
        return {
          id: chat.id,
          name: contact.name || contact.push_name || contact.phone,
          phone: contact.phone,
          avatar: contact.profile_pic_url,
          lastMessage: chat.last_message,
          lastMessageTime: chat.last_message_time,
          unreadCount: chat.unread_count,
          pinned: chat.pinned,
          archived: chat.archived,
          muted: chat.muted,
          presence: 'offline', // Por enquanto sempre offline
          isGroup: contact.is_group,
          chatId: chat.chat_id
        }
      })

      res.json({
        chats: transformedChats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalChats,
          totalPages: Math.ceil(totalChats / limit),
          hasMore: offset + chats.length < totalChats
        }
      })
    } catch (error) {
      console.error('Erro ao obter chats:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Sincronizar chats do WhatsApp
  async syncChats(req, res) {
    try {
      const { instanceId } = req.params

      if (!instanceId || instanceId === 'undefined') {
        return res.status(400).json({ error: 'Parâmetro instanceId inválido' })
      }

      // Rate limiting - máximo 5 syncs por 60 segundos por instância (ajustado para melhor UX)
      const canSync = await redisService.checkSyncRateLimit(instanceId, 5, 60)
      if (!canSync) {
        console.log(`⏸️ Sync bloqueado por rate limit para instância ${instanceId}`)
        return res.status(429).json({ 
          error: 'Muitas tentativas de sincronização. Aguarde um momento antes de tentar novamente.',
          retryAfter: 60 
        })
      }

      const instance = await SupabaseInstance.findById(instanceId)

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      // Verificar se usuário tem acesso (se não for autenticação via API)
      if (req.user?.role !== 'admin' && req.user?.id && instance.user_id !== req.user.id) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      if (!['connected', 'connecting'].includes(instance.status)) {
        return res.status(400).json({ 
          error: 'Instância não está disponível para sincronização',
          status: instance.status,
          message: 'A instância precisa estar conectada ou conectando'
        })
      }

      // Se está conectando, avisar que pode não ter dados ainda
      if (instance.status === 'connecting') {
        console.log(`⚠️ Tentando sincronizar instância ${instanceId} que ainda está conectando`)
      }

      // Iniciar progresso de sincronização
      emitSyncStart(instanceId, 'manual')
      
      // Salvar progresso inicial no Redis
      await redisService.setSyncProgress(instanceId, {
        type: 'manual',
        status: 'starting',
        step: 'Obtendo chats da Evolution API...',
        progress: 5,
        contactsProcessed: 0,
        chatsProcessed: 0,
        totalContacts: 0,
        totalChats: 0
      })

      // Obter chats do Evolution API
      const evolutionChats = await evolutionApi.getChats(
        instance.evolution_instance_id
      )

      let syncedCount = 0
      let updatedCount = 0
      let processedChats = []

      // Filtrar chats válidos primeiro
      const validChats = evolutionChats.filter(chat => {
        return chat.remoteJid && chat.remoteJid !== 'status@broadcast'
      })

      console.log(`📋 Processando ${validChats.length} chats válidos`)
      
      // Atualizar progresso com totais
      await redisService.setSyncProgress(instanceId, {
        type: 'manual',
        status: 'processing',
        step: `Processando ${validChats.length} chats...`,
        progress: 10,
        contactsProcessed: 0,
        chatsProcessed: 0,
        totalContacts: validChats.length,
        totalChats: validChats.length
      })

      emitSyncProgress(instanceId, {
        status: 'processing',
        step: `Processando ${validChats.length} chats...`,
        progress: 10,
        contactsProcessed: 0,
        chatsProcessed: 0,
        totalContacts: validChats.length,
        totalChats: validChats.length
      })

      // Processar em lotes de 25 para evitar timeout e mostrar progresso
      const batchSize = 25
      for (let i = 0; i < validChats.length; i += batchSize) {
        const batch = validChats.slice(i, i + batchSize)
        const batchNumber = Math.floor(i/batchSize) + 1
        const totalBatches = Math.ceil(validChats.length/batchSize)
        
        console.log(`📦 Processando lote ${batchNumber}/${totalBatches} (${batch.length} chats)`)
        
        // Atualizar progresso do lote
        const currentProgress = Math.round(((i + batch.length) / validChats.length) * 80) + 10 // 10-90%
        const progressStep = `Processando lote ${batchNumber}/${totalBatches}...`
        
        await redisService.setSyncProgress(instanceId, {
          type: 'manual',
          status: 'processing',
          step: progressStep,
          progress: currentProgress,
          contactsProcessed: i + batch.length,
          chatsProcessed: processedChats.length,
          totalContacts: validChats.length,
          totalChats: validChats.length
        })

        emitSyncProgress(instanceId, {
          status: 'processing',
          step: progressStep,
          progress: currentProgress,
          contactsProcessed: i + batch.length,
          chatsProcessed: processedChats.length,
          totalContacts: validChats.length,
          totalChats: validChats.length
        })
        
        for (const chat of batch) {
          // Extrair número do telefone do remoteJid
          const phoneNumber = chat.remoteJid?.includes('@') 
            ? chat.remoteJid.split('@')[0] 
            : chat.remoteJid

          try {
            // Validar dados antes de processar
            if (!phoneNumber || phoneNumber.trim() === '') {
              console.warn(`⚠️ Número de telefone inválido: ${phoneNumber}`)
              continue
            }
            
            if (!instance.id) {
              throw new Error('ID da instância não encontrado')
            }

            // Criar ou encontrar contato usando Supabase (com retry automático)
            const contactDefaults = {
              name: chat.pushName ? chat.pushName.trim() : null,
              push_name: chat.pushName ? chat.pushName.trim() : null,
              profile_pic_url: chat.profilePicUrl || null,
              is_group: chat.remoteJid?.includes('@g.us') || false,
              group_metadata: chat.remoteJid?.includes('@g.us') ? chat : null,
              is_blocked: false,
              last_seen: new Date().toISOString()
            }

            // Usar o método findOrCreate do Supabase que já trata constraints
            const contactResult = await Contact.findOrCreate(
              phoneNumber.trim(),
              instance.id,
              contactDefaults
            )

            const contact = contactResult.data
            if (contactResult.created) {
              syncedCount++
            } else {
              updatedCount++
            }

            // Processar chat usando Supabase
            const chatDefaults = {
              contact_id: contact.id,
              last_message: {
                content: chat.lastMessage?.message?.conversation || 
                        (chat.remoteJid?.includes('@g.us') ? '👥 Grupo do WhatsApp' : '💬 Conversa ativa'),
                type: 'text',
                fromMe: false,
                timestamp: new Date().toISOString()
              },
              last_message_time: chat.lastMessage?.messageTimestamp ? 
                new Date(chat.lastMessage.messageTimestamp * 1000).toISOString() : 
                new Date().toISOString(),
              unread_count: chat.unreadCount || 0,
              pinned: chat.pin || chat.pinned || false,
              archived: chat.archived || false
            }

            // Usar findOrCreate do Supabase para chat
            const chatResult = await Chat.findOrCreate(
              chat.remoteJid,
              instance.id,
              chatDefaults
            )

            const chatRecord = chatResult.data

          processedChats.push({
            remoteJid: chat.remoteJid,
            phoneNumber,
            processed: true
          })

        } catch (contactError) {
          console.error(`❌ Erro ao processar chat ${phoneNumber}:`, contactError.message)
          processedChats.push({
            remoteJid: chat.remoteJid,
            phoneNumber,
            processed: false,
            error: contactError.message
          })
          // Continuar com próximo chat
        }
        } // Fechamento do for do batch
        
        // Pequena pausa entre lotes para evitar sobrecarga do banco
        if (i + batchSize < validChats.length) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      } // Fechamento do for dos lotes

      console.log(`✅ Sincronização concluída: ${syncedCount} novos, ${updatedCount} atualizados`)

      // Finalizar progresso 
      await redisService.setSyncProgress(instanceId, {
        type: 'manual',
        status: 'finalizing',
        step: 'Finalizando sincronização...',
        progress: 95,
        contactsProcessed: validChats.length,
        chatsProcessed: processedChats.length,
        totalContacts: validChats.length,
        totalChats: validChats.length
      })

      emitSyncProgress(instanceId, {
        status: 'finalizing', 
        step: 'Finalizando sincronização...',
        progress: 95,
        contactsProcessed: validChats.length,
        chatsProcessed: processedChats.length,
        totalContacts: validChats.length,
        totalChats: validChats.length
      })

      await SupabaseInstance.update(instance.id, { last_seen: new Date() })

      // Emitir evento via WebSocket para atualizar UI
      const io = socketService.getIO()
      if (io) {
        io.to(`instance_${instance.id}`).emit('chats_update', {
          instanceId: instance.id,
          message: 'Chats sincronizados com sucesso',
          syncedCount,
          updatedCount,
          totalChats: validChats.length
        })
        // console.log(`📡 Evento chats_update emitido para instância ${instanceId}`)
      }

      // Concluir progresso
      emitSyncComplete(instanceId, true)
      await redisService.deleteSyncProgress(instanceId)

      res.json({
        message: 'Chats sincronizados com sucesso',
        syncedCount,
        updatedCount,
        totalChats: validChats.length,
        processedChats: processedChats.slice(0, 10) // Primeiros 10 para debug
      })
    } catch (error) {
      console.error('Erro ao sincronizar chats:', error)
      
      // Emitir erro no progresso (usar instanceId se disponível)
      if (instanceId) {
        emitSyncComplete(instanceId, false, error.message)
        await redisService.deleteSyncProgress(instanceId)
      }
      
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Obter detalhes de um chat específico
  async getChat(req, res) {
    try {
      const { instanceId, chatId } = req.params

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      const chat = await Chat.findOne({
        where: {
          id: chatId,
          instanceId
        },
        include: [Contact]
      })

      if (!chat) {
        return res.status(404).json({ error: 'Chat não encontrado' })
      }

      res.json({ chat })
    } catch (error) {
      console.error('Erro ao obter chat:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Marcar chat como lido
  async markAsRead(req, res) {
    try {
      const { instanceId, chatId } = req.params

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      const chat = await Chat.findOne({
        where: { id: chatId, instanceId },
        include: [Contact]
      })

      if (!chat) {
        return res.status(404).json({ error: 'Chat não encontrado' })
      }

      // Marcar como lido no WhatsApp
      await evolutionApi.markAsRead(
        instance.evolutionInstanceId,
        chat.Contact.phone
      )

      // Atualizar contador local
      await chat.update({ unreadCount: 0 })

      res.json({ message: 'Chat marcado como lido' })
    } catch (error) {
      console.error('Erro ao marcar chat como lido:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Arquivar/desarquivar chat
  async toggleArchive(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const { archived } = req.body

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      const chat = await Chat.findOne({
        where: { id: chatId, instanceId }
      })

      if (!chat) {
        return res.status(404).json({ error: 'Chat não encontrado' })
      }

      await chat.update({ archived: archived === true })

      res.json({
        message: `Chat ${archived ? 'arquivado' : 'desarquivado'} com sucesso`
      })
    } catch (error) {
      console.error('Erro ao arquivar/desarquivar chat:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Fixar/desfixar chat
  async togglePin(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const { pinned } = req.body

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      const chat = await Chat.findOne({
        where: { id: chatId, instanceId }
      })

      if (!chat) {
        return res.status(404).json({ error: 'Chat não encontrado' })
      }

      await chat.update({ pinned: pinned === true })

      res.json({
        message: `Chat ${pinned ? 'fixado' : 'desfixado'} com sucesso`
      })
    } catch (error) {
      console.error('Erro ao fixar/desfixar chat:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Definir presença (digitando, gravando, etc.)
  async setPresence(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const { presence = 'composing' } = req.body // composing, recording, paused

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      const chat = await Chat.findOne({
        where: { id: chatId, instanceId },
        include: [Contact]
      })

      if (!chat) {
        return res.status(404).json({ error: 'Chat não encontrado' })
      }

      await evolutionApi.setPresence(
        instance.evolutionInstanceId,
        chat.Contact.phone,
        presence
      )

      res.json({ message: 'Presença definida com sucesso' })
    } catch (error) {
      console.error('Erro ao definir presença:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
}

module.exports = new ChatController()
