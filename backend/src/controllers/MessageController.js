const { Message, Chat, Contact, Instance } = require('../models')
const evolutionApi = require('../services/evolutionApi')
const { Op } = require('sequelize')
const fs = require('fs').promises
const path = require('path')

class MessageController {
  // Obter mensagens de um chat
  async getMessages(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const { page = 1, limit = 50, search = '' } = req.query

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

      const offset = (page - 1) * limit

      // Construir query de busca
      let whereClause = {
        chatId: chat.Contact.phone,
        instanceId,
        deleted: false
      }

      if (search) {
        whereClause.content = {
          [Op.like]: `%${search}%`
        }
      }

      const messages = await Message.findAndCountAll({
        where: whereClause,
        include: [Contact],
        order: [['timestamp', 'DESC']],
        limit: parseInt(limit),
        offset
      })

      res.json({
        messages: messages.rows.reverse(), // Inverter para ordem cronológica
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(messages.count / limit),
          totalMessages: messages.count,
          hasMore: offset + messages.rows.length < messages.count
        }
      })
    } catch (error) {
      console.error('Erro ao obter mensagens:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Enviar mensagem de texto
  async sendTextMessage(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const { message, quotedMessageId } = req.body

      if (!message || message.trim() === '') {
        return res.status(400).json({ error: 'Mensagem não pode estar vazia' })
      }

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      if (instance.status !== 'connected') {
        return res.status(400).json({ error: 'Instância não está conectada' })
      }

      const chat = await Chat.findOne({
        where: { id: chatId, instanceId },
        include: [Contact]
      })

      if (!chat) {
        return res.status(404).json({ error: 'Chat não encontrado' })
      }

      // Enviar mensagem via Evolution API
      const evolutionResponse = await evolutionApi.sendTextMessage(
        instance.evolutionInstanceId,
        chat.Contact.phone,
        message,
        quotedMessageId
      )

      // Salvar mensagem no banco
      const messageRecord = await Message.create({
        messageId: evolutionResponse.key?.id || `temp_${Date.now()}`,
        fromMe: true,
        chatId: chat.Contact.phone,
        messageType: 'text',
        content: message,
        timestamp: new Date(),
        status: 'sent',
        instanceId: instance.id,
        contactId: chat.contactId,
        quotedMessage: quotedMessageId ? { id: quotedMessageId } : null
      })

      // Atualizar última mensagem do chat
      await chat.update({
        lastMessage: message,
        lastMessageTime: new Date()
      })

      res.json({
        message: messageRecord,
        evolutionResponse
      })
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Enviar mídia
  async sendMediaMessage(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const { caption = '', quotedMessageId } = req.body

      if (!req.file) {
        return res.status(400).json({ error: 'Arquivo de mídia é obrigatório' })
      }

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      if (instance.status !== 'connected') {
        return res.status(400).json({ error: 'Instância não está conectada' })
      }

      const chat = await Chat.findOne({
        where: { id: chatId, instanceId },
        include: [Contact]
      })

      if (!chat) {
        return res.status(404).json({ error: 'Chat não encontrado' })
      }

      // Determinar tipo de mídia
      const mimeType = req.file.mimetype
      let mediaType = 'document'

      if (mimeType.startsWith('image/')) {
        mediaType = 'image'
      } else if (mimeType.startsWith('video/')) {
        mediaType = 'video'
      } else if (mimeType.startsWith('audio/')) {
        mediaType = 'audio'
      }

      // Enviar mídia via Evolution API
      const mediaPath = req.file.path
      const evolutionResponse = await evolutionApi.sendMediaMessage(
        instance.evolutionInstanceId,
        chat.Contact.phone,
        mediaPath,
        mediaType,
        caption,
        quotedMessageId
      )

      // Salvar mensagem no banco
      const messageRecord = await Message.create({
        messageId: evolutionResponse.key?.id || `temp_${Date.now()}`,
        fromMe: true,
        chatId: chat.Contact.phone,
        messageType: mediaType,
        content: caption,
        mediaPath: mediaPath,
        mediaMimeType: mimeType,
        mediaSize: req.file.size,
        timestamp: new Date(),
        status: 'sent',
        instanceId: instance.id,
        contactId: chat.contactId,
        quotedMessage: quotedMessageId ? { id: quotedMessageId } : null
      })

      // Atualizar última mensagem do chat
      const lastMessage =
        caption ||
        `📎 ${
          mediaType === 'image'
            ? 'Imagem'
            : mediaType === 'video'
            ? 'Vídeo'
            : mediaType === 'audio'
            ? 'Áudio'
            : 'Documento'
        }`

      await chat.update({
        lastMessage,
        lastMessageTime: new Date()
      })

      res.json({
        message: messageRecord,
        evolutionResponse
      })
    } catch (error) {
      console.error('Erro ao enviar mídia:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Sincronizar mensagens de um chat
  async syncMessages(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const { limit = 50 } = req.query

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

      // Obter mensagens do Evolution API
      const evolutionMessages = await evolutionApi.getChatMessages(
        instance.evolutionInstanceId,
        chat.Contact.phone,
        limit
      )

      let syncedCount = 0
      let updatedCount = 0

      for (const msg of evolutionMessages) {
        // Verificar se mensagem já existe
        const existingMessage = await Message.findOne({
          where: {
            messageId: msg.key.id,
            instanceId: instance.id
          }
        })

        if (!existingMessage) {
          // Determinar tipo de mensagem
          let messageType = 'text'
          let content = ''
          let mediaPath = null
          let mediaMimeType = null
          let mediaSize = null

          if (msg.message?.conversation) {
            content = msg.message.conversation
          } else if (msg.message?.extendedTextMessage?.text) {
            content = msg.message.extendedTextMessage.text
          } else if (msg.message?.imageMessage) {
            messageType = 'image'
            content = msg.message.imageMessage.caption || ''
            mediaMimeType = msg.message.imageMessage.mimetype
            // TODO: Download da mídia se necessário
          } else if (msg.message?.videoMessage) {
            messageType = 'video'
            content = msg.message.videoMessage.caption || ''
            mediaMimeType = msg.message.videoMessage.mimetype
          } else if (msg.message?.audioMessage) {
            messageType = 'audio'
            mediaMimeType = msg.message.audioMessage.mimetype
          } else if (msg.message?.documentMessage) {
            messageType = 'document'
            content =
              msg.message.documentMessage.title ||
              msg.message.documentMessage.fileName ||
              ''
            mediaMimeType = msg.message.documentMessage.mimetype
          }

          await Message.create({
            messageId: msg.key.id,
            fromMe: msg.key.fromMe,
            chatId: msg.key.remoteJid,
            participant: msg.key.participant || null,
            messageType,
            content,
            mediaPath,
            mediaMimeType,
            mediaSize,
            timestamp: new Date(msg.messageTimestamp * 1000),
            status: msg.key.fromMe ? 'sent' : 'received',
            instanceId: instance.id,
            contactId: chat.contactId,
            quotedMessage:
              msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
              null,
            mentions:
              msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
              null
          })

          syncedCount++
        }
      }

      res.json({
        message: 'Mensagens sincronizadas com sucesso',
        syncedCount,
        totalMessages: evolutionMessages.length
      })
    } catch (error) {
      console.error('Erro ao sincronizar mensagens:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Download de mídia
  async downloadMedia(req, res) {
    try {
      const { instanceId, messageId } = req.params

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      const message = await Message.findOne({
        where: {
          id: messageId,
          instanceId
        }
      })

      if (!message) {
        return res.status(404).json({ error: 'Mensagem não encontrada' })
      }

      // Se já tem arquivo local, servir diretamente
      if (
        message.mediaPath &&
        (await fs
          .access(message.mediaPath)
          .then(() => true)
          .catch(() => false))
      ) {
        return res.sendFile(path.resolve(message.mediaPath))
      }

      // Caso contrário, baixar do Evolution API
      const mediaStream = await evolutionApi.downloadMedia(
        instance.evolutionInstanceId,
        message.messageId
      )

      // Salvar arquivo localmente
      const fileName = `${message.messageId}_${Date.now()}`
      const filePath = path.join('uploads', fileName)

      const fileStream = require('fs').createWriteStream(filePath)
      mediaStream.pipe(fileStream)

      await new Promise((resolve, reject) => {
        fileStream.on('finish', resolve)
        fileStream.on('error', reject)
      })

      // Atualizar caminho no banco
      await message.update({ mediaPath: filePath })

      res.sendFile(path.resolve(filePath))
    } catch (error) {
      console.error('Erro ao baixar mídia:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Buscar mensagens em todos os chats
  async searchMessages(req, res) {
    try {
      const { instanceId } = req.params
      const { query, page = 1, limit = 50 } = req.query

      if (!query || query.trim() === '') {
        return res.status(400).json({ error: 'Query de busca é obrigatória' })
      }

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      const offset = (page - 1) * limit

      const messages = await Message.findAndCountAll({
        where: {
          instanceId,
          content: {
            [Op.like]: `%${query}%`
          },
          deleted: false
        },
        include: [Contact],
        order: [['timestamp', 'DESC']],
        limit: parseInt(limit),
        offset
      })

      res.json({
        messages: messages.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(messages.count / limit),
          totalMessages: messages.count,
          hasMore: offset + messages.rows.length < messages.count
        },
        query
      })
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Deletar mensagem
  async deleteMessage(req, res) {
    try {
      const { instanceId, messageId } = req.params

      const instance = await Instance.findOne({
        where: {
          id: instanceId,
          ...(req.user.role !== 'admin' ? { userId: req.user.id } : {})
        }
      })

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      const message = await Message.findOne({
        where: {
          id: messageId,
          instanceId,
          fromMe: true // Só pode deletar mensagens próprias
        }
      })

      if (!message) {
        return res
          .status(404)
          .json({ error: 'Mensagem não encontrada ou não pode ser deletada' })
      }

      await message.update({ deleted: true })

      res.json({ message: 'Mensagem deletada com sucesso' })
    } catch (error) {
      console.error('Erro ao deletar mensagem:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
}

module.exports = new MessageController()
