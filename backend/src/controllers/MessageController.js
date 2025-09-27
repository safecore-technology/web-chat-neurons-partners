const { SupabaseMessage, SupabaseChat, SupabaseContact, SupabaseInstance } = require('../models/supabase')
// Aliases para compatibilidade
const Message = SupabaseMessage
const Chat = SupabaseChat
const Contact = SupabaseContact
const Instance = SupabaseInstance
const evolutionApi = require('../services/evolutionApi')
const fs = require('fs').promises
const path = require('path')

class MessageController {
  // Obter mensagens de um chat
  async getMessages(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const { page = 1, limit = 50, search = '' } = req.query

      console.log(`� MessageController.getMessages RECEBIDO:`, {
        instanceId,
        chatId,
        page,
        limit,
        query: req.query,
        params: req.params,
        url: req.originalUrl
      });

      // Verificar se usuário tem acesso à instância (se não for autenticação via API)
      if (req.user?.role !== 'admin' && req.user?.id) {
        const instance = await Instance.findById(instanceId)
        if (!instance || instance.user_id !== req.user.id) {
          console.log(`❌ Instância não encontrada ou sem permissão: ${instanceId}`);
          return res.status(404).json({ error: 'Instância não encontrada' })
        }
      }

      // Buscar instância para obter o nome para a Evolution API
      const instance = await Instance.findById(instanceId);
      
      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' });
      }

      try {
        // Preparar o remoteJid - garantir formato correto
        let remoteJid = chatId;
        
        // Se é apenas um número, adicionar @s.whatsapp.net
        if (/^\d+$/.test(chatId)) {
          remoteJid = `${chatId}@s.whatsapp.net`;
        }
        
        // Usar evolution_instance_id se disponível, senão usar name
        const evolutionInstanceName = instance.evolution_instance_id || instance.name;

        // Buscar mensagens diretamente da Evolution API
        const evolutionResponse = await evolutionApi.getChatMessages(evolutionInstanceName, remoteJid, {
          page: parseInt(page),
          offset: (parseInt(page) - 1) * parseInt(limit),
          limit: parseInt(limit)
        });

        // A resposta da Evolution API tem a estrutura: { messages: { total, pages, currentPage, records } }
        const messagesData = evolutionResponse?.messages || evolutionResponse;
        const messageRecords = messagesData?.records || messagesData || [];

        // Evolution API response processed

        // Transformar mensagens da Evolution API para formato do frontend
        const transformedMessages = messageRecords.map((msg) => {
          const locationMetadata = MessageController.getLocationData(msg.message);
          const rawMessageType = locationMetadata
            ? 'location'
            : msg.messageType || MessageController.getMessageType(msg.message);
          const messageType = MessageController.normalizeMessageType(rawMessageType);
          const messageContent = MessageController.extractMessageContent(msg.message, locationMetadata);

          return {
            id: msg.id || msg.key?.id || `${Date.now()}-${Math.random()}`,
            messageId: msg.key?.id,
            fromMe: msg.key?.fromMe || false,
            content: messageContent,
            messageType,
            timestamp: msg.messageTimestamp ? 
              new Date(parseInt(msg.messageTimestamp) * 1000).toISOString() : 
              new Date().toISOString(),
            status: msg.status || 'delivered',
            mediaPath: MessageController.getMediaPath(msg.message),
            mediaMimeType: MessageController.getMediaMimeType(msg.message),
            pushName: msg.pushName,
            remoteJid: msg.key?.remoteJid,
            message: msg.message || null,
            location: locationMetadata,
            mapsUrl: locationMetadata?.url || null,
            locationThumbnail: locationMetadata?.thumbnail || null,
            sticker: MessageController.getStickerData(msg.message),
            source: msg.source || 'api'
          };
        });

        // Sempre ordenar mensagens por timestamp cronológico (mais antigas primeiro)
        // O frontend vai exibir corretamente: antigas no topo, recentes embaixo
        transformedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Messages transformed successfully

        // Calcular informações de paginação baseado na resposta da Evolution API
        const totalMessages = messagesData?.total || transformedMessages.length;
        const totalPages = messagesData?.pages || Math.ceil(totalMessages / parseInt(limit));
        const currentPageFromAPI = messagesData?.currentPage || parseInt(page);
        const hasMore = currentPageFromAPI < totalPages;

        res.json({
          messages: transformedMessages,
          pagination: {
            currentPage: currentPageFromAPI,
            totalPages: totalPages,
            totalMessages: totalMessages,
            hasMore: hasMore
          }
        });

      } catch (evolutionError) {
        console.log(`⚠️  Erro ao buscar mensagens da Evolution API para ${chatId}:`, evolutionError.message);
        
        // Fallback: tentar buscar do banco local
        try {
          const offset = (parseInt(page) - 1) * parseInt(limit);
          
          const localMessages = await Message.findByChatId(chatId, instanceId, {
            limit: parseInt(limit),
            offset: offset
          });

          const messagesList = localMessages || [];

          console.log(`📦 Fallback: encontradas ${messagesList.length} mensagens locais para chat ${chatId}`);

          const transformedMessages = messagesList.map(msg => ({
            id: msg.id,
            messageId: msg.message_id,
            fromMe: msg.from_me,
            content: msg.content,
            messageType: msg.message_type,
            timestamp: msg.timestamp_msg,
            status: msg.status,
            mediaPath: msg.media_path,
            mediaMimeType: msg.media_mime_type,
            Contact: msg.contacts
          }));

          res.json({
            messages: transformedMessages,
            pagination: {
              currentPage: parseInt(page),
              totalPages: transformedMessages.length > 0 ? Math.ceil(transformedMessages.length / parseInt(limit)) : 0,
              totalMessages: transformedMessages.length,
              hasMore: transformedMessages.length === parseInt(limit)
            }
          });

        } catch (localError) {
          console.log(`⚠️  Erro também no banco local, retornando lista vazia:`, localError.message);
          
          // Para chats novos ou erros, retornar lista vazia em vez de erro 500
          res.json({
            messages: [],
            pagination: {
              currentPage: parseInt(page),
              totalPages: 0,
              totalMessages: 0,
              hasMore: false
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ Erro ao obter mensagens:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }

  // Helper para extrair conteúdo da mensagem
  static extractMessageContent(message, locationMetadata = null) {
    if (!message) return 'Mensagem sem conteúdo';
    
    // Mensagem de texto simples
    if (message.conversation) {
      return message.conversation;
    }
    
    // Mensagem de texto estendida
    if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text;
    }
    
    // Mensagens de mídia com caption
    if (message.imageMessage?.caption) {
      return message.imageMessage.caption;
    }
    
    if (message.videoMessage?.caption) {
      return message.videoMessage.caption;
    }
    
    if (message.documentMessage?.caption) {
      return message.documentMessage.caption;
    }
    
    // Mensagens de mídia sem caption - mostrar tipo + nome do arquivo se disponível
    if (message.imageMessage) {
      return '📷 Imagem';
    }
    
    if (message.videoMessage) {
      return '🎥 Vídeo';
    }
    
    if (message.audioMessage) {
      return '🎵 Áudio';
    }
    
    if (message.documentMessage) {
      const fileName = message.documentMessage.fileName || 'Documento';
      return `📄 ${fileName}`;
    }
    
    if (message.stickerMessage) {
      return '😄 Sticker';
    }
    
    if (message.locationMessage) {
      if (locationMetadata) {
        if (locationMetadata.label) {
          return `📍 ${locationMetadata.label}`;
        }

        if (typeof locationMetadata.latitude === 'number' && typeof locationMetadata.longitude === 'number') {
          return `📍 ${locationMetadata.latitude.toFixed(6)}, ${locationMetadata.longitude.toFixed(6)}`;
        }
      }

      const lat = message.locationMessage.degreesLatitude ?? message.locationMessage.latitude;
      const lon = message.locationMessage.degreesLongitude ?? message.locationMessage.longitude;

      if (typeof lat === 'number' && typeof lon === 'number') {
        return `📍 ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      }

      return '📍 Localização';
    }
    
    if (message.contactMessage) {
      return '👤 Contato';
    }
    
    return 'Mensagem de mídia';
  }

  // Helper para determinar tipo da mensagem
  static getMessageType(message) {
    if (!message) return 'text';
    
    if (message.conversation) return 'text';
    if (message.extendedTextMessage) return 'text';
    if (message.imageMessage) return 'image';
    if (message.videoMessage) return 'video';
    if (message.audioMessage) return 'audio';
    if (message.documentMessage) return 'document';
    if (message.stickerMessage) return 'sticker';
    if (message.locationMessage) return 'location';
    if (message.contactMessage) return 'contact';
    
    return 'text';
  }

  static normalizeMessageType(messageType) {
    if (!messageType) return 'text';

    if (messageType === 'stickerMessage') return 'sticker';
    if (messageType === 'imageMessage') return 'imageMessage';
    if (messageType === 'videoMessage') return 'videoMessage';
    if (messageType === 'audioMessage') return 'audioMessage';
    if (messageType === 'documentMessage') return 'documentMessage';

    return messageType;
  }

  // Helper para extrair caminho da mídia
  static getMediaPath(message) {
    if (!message) return null;
    
    if (message.imageMessage?.url) return message.imageMessage.url;
    if (message.videoMessage?.url) return message.videoMessage.url;
    if (message.audioMessage?.url) return message.audioMessage.url;
    if (message.documentMessage?.url) return message.documentMessage.url;
    if (message.stickerMessage?.url) return message.stickerMessage.url;
    
    return null;
  }

  // Helper para extrair mime type da mídia
  static getMediaMimeType(message) {
    if (!message) return null;
    
    if (message.imageMessage?.mimetype) return message.imageMessage.mimetype;
    if (message.videoMessage?.mimetype) return message.videoMessage.mimetype;
    if (message.audioMessage?.mimetype) return message.audioMessage.mimetype;
    if (message.documentMessage?.mimetype) return message.documentMessage.mimetype;
    if (message.stickerMessage?.mimetype) return message.stickerMessage.mimetype || 'image/webp';
    
    return null;
  }

  static getStickerData(message) {
    const sticker = message?.stickerMessage;
    if (!sticker) return null;

    return {
      isAnimated: Boolean(sticker.isAnimated),
      isLottie: Boolean(sticker.isLottie),
      mimetype: sticker.mimetype || 'image/webp',
      fileSha256: sticker.fileSha256 || null,
      fileEncSha256: sticker.fileEncSha256 || null,
      mediaKey: sticker.mediaKey || null,
      fileLength: sticker.fileLength || null,
      directPath: sticker.directPath || null
    };
  }

  static getLocationData(message) {
    const location = message?.locationMessage;
    if (!location) return null;

    const latitude = location.degreesLatitude ?? location.latitude ?? location.lat ?? null;
    const longitude = location.degreesLongitude ?? location.longitude ?? location.lng ?? null;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return null;
    }

    const label = location.name || location.address || location.caption || location.description || null;
    const thumbnail = location.jpegThumbnail || null;
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;

    return {
      latitude,
      longitude,
      label,
      thumbnail,
      url,
      address: location.address || null,
      name: location.name || null,
      description: location.caption || location.description || null
    };
  }

  static getEvolutionInstanceName(instance) {
    if (!instance) return null;

    return (
      instance.evolution_instance_id ||
      instance.evolutionInstanceId ||
      instance.evolution_instanceId ||
      instance.evolutioninstanceid ||
      instance.name
    );
  }

  // Enviar mensagem de texto via Evolution API
  async sendTextMessage(req, res) {
    try {
      const { instanceId, chatId } = req.params
      const {
        number: bodyNumber,
        text,
        message,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
        quoted,
        quotedMessageId,
        options = {}
      } = req.body || {}

      const rawNumber = bodyNumber || options.number || req.body?.chatId || chatId
      const normalizedNumber = rawNumber
        ? String(rawNumber).split('@')[0].replace(/\s+/g, '')
        : null

      if (!normalizedNumber) {
        return res.status(400).json({ error: 'Número do contato não informado' })
      }

      const finalText = (text ?? message ?? '').toString().trim()

      if (!finalText) {
        return res.status(400).json({ error: 'Mensagem não pode estar vazia' })
      }

      const instance = await Instance.findById(instanceId)

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      if (
        req.user?.role !== 'admin' &&
        req.user?.id &&
        instance.user_id &&
        instance.user_id !== req.user.id
      ) {
        return res.status(403).json({ error: 'Acesso negado à instância' })
      }

      if (instance.status && instance.status !== 'connected') {
        return res.status(400).json({ error: 'Instância não está conectada' })
      }

      const evolutionInstanceName = MessageController.getEvolutionInstanceName(instance)

      if (!evolutionInstanceName) {
        return res.status(400).json({ error: 'Instância Evolution inválida' })
      }

      const quotedPayload = quotedMessageId
        ? {
            key: {
              id: quotedMessageId
            }
          }
        : quoted

      const payload = {
        number: normalizedNumber,
        text: finalText,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
        quoted: quotedPayload
      }

      Object.keys(payload).forEach(key => {
        if (
          payload[key] === undefined ||
          payload[key] === null ||
          (Array.isArray(payload[key]) && payload[key].length === 0) ||
          (typeof payload[key] === 'object' && Object.keys(payload[key]).length === 0)
        ) {
          delete payload[key]
        }
      })

      const evolutionResponse = await evolutionApi.sendText(
        evolutionInstanceName,
        payload
      )

      res.status(201).json({
        number: normalizedNumber,
        chatId: chatId || normalizedNumber,
        text: finalText,
        evolution: evolutionResponse
      })
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      const status = error.response?.status || 500
      res.status(status).json({
        error: error.response?.data?.error || 'Erro ao enviar mensagem',
        details: error.response?.data || error.message
      })
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
      const evolutionInstanceName = MessageController.getEvolutionInstanceName(instance)

      if (!evolutionInstanceName) {
        return res.status(400).json({ error: 'Instância Evolution inválida' })
      }

      const evolutionResponse = await evolutionApi.sendMediaMessage(
        evolutionInstanceName,
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

  // Enviar mídia via Evolution API (base64/URL)
  async sendMedia(req, res) {
    try {
      const { instanceId } = req.params
      const {
        number,
        mediatype,
        mimetype,
        caption = '',
        media,
        fileName,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
        quoted,
        chatId
      } = req.body || {}

      if (!number || !media || !mediatype || !mimetype || !fileName) {
        return res.status(400).json({
          error:
            'Campos obrigatórios ausentes. Informe number, media, mediatype, mimetype e fileName.'
        })
      }

      const instance = await Instance.findById(instanceId)

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      if (req.user?.role !== 'admin' && req.user?.id && instance.user_id && instance.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Acesso negado à instância' })
      }

      if (instance.status && instance.status !== 'connected') {
        return res.status(400).json({ error: 'Instância não está conectada' })
      }

      const evolutionInstanceName = MessageController.getEvolutionInstanceName(instance)

      if (!evolutionInstanceName) {
        return res.status(400).json({ error: 'Instância Evolution inválida' })
      }

      const payload = {
        number,
        mediatype,
        mimetype,
        caption,
        media,
        fileName,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
        quoted
      }

      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined || payload[key] === null || (Array.isArray(payload[key]) && payload[key].length === 0)) {
          delete payload[key]
        }
      })

      const evolutionResponse = await evolutionApi.sendMedia(
        evolutionInstanceName,
        payload
      )

      res.status(201).json({
        number,
        chatId: chatId || number,
        mediatype,
        caption,
        fileName,
        evolution: evolutionResponse
      })
    } catch (error) {
      console.error('Erro ao enviar mídia (API):', error.response?.data || error.message)
      const status = error.response?.status || 500
      res.status(status).json({
        error: error.response?.data?.error || 'Erro ao enviar mídia',
        details: error.response?.data || error.message
      })
    }
  }

  // Enviar áudio via Evolution API
  async sendWhatsAppAudio(req, res) {
    try {
      const { instanceId } = req.params
      const {
        number,
        audio,
        mimetype,
        ptt,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
        quoted,
        chatId,
        seconds,
        fileName,
        metadata
      } = req.body || {}

      if (!number || !audio) {
        return res.status(400).json({
          error: 'Campos obrigatórios ausentes. Informe number e audio.'
        })
      }

      const instance = await Instance.findById(instanceId)

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      if (req.user?.role !== 'admin' && req.user?.id && instance.user_id && instance.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Acesso negado à instância' })
      }

      if (instance.status && instance.status !== 'connected') {
        return res.status(400).json({ error: 'Instância não está conectada' })
      }

      const evolutionInstanceName = MessageController.getEvolutionInstanceName(instance)

      if (!evolutionInstanceName) {
        return res.status(400).json({ error: 'Instância Evolution inválida' })
      }

      const payload = {
        number,
        audio,
        mimetype,
        ptt,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
        quoted,
        seconds,
        fileName,
        metadata
      }

      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined || payload[key] === null || (Array.isArray(payload[key]) && payload[key].length === 0)) {
          delete payload[key]
        }
      })

      const evolutionResponse = await evolutionApi.sendWhatsAppAudio(
        evolutionInstanceName,
        payload
      )

      res.status(200).json({
        number,
        chatId: chatId || number,
        evolution: evolutionResponse
      })
    } catch (error) {
      console.error('Erro ao enviar áudio (API):', error.response?.data || error.message)
      const status = error.response?.status || 500
      res.status(status).json({
        error: error.response?.data?.error || 'Erro ao enviar áudio',
        details: error.response?.data || error.message
      })
    }
  }

  // Enviar sticker via Evolution API
  async sendSticker(req, res) {
    try {
      const { instanceId } = req.params
      const {
        number,
        sticker,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
        quoted,
        chatId
      } = req.body || {}

      if (!number || !sticker) {
        return res.status(400).json({
          error: 'Campos obrigatórios ausentes. Informe number e sticker.'
        })
      }

      const instance = await Instance.findById(instanceId)

      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }

      if (req.user?.role !== 'admin' && req.user?.id && instance.user_id && instance.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Acesso negado à instância' })
      }

      if (instance.status && instance.status !== 'connected') {
        return res.status(400).json({ error: 'Instância não está conectada' })
      }

      const evolutionInstanceName = MessageController.getEvolutionInstanceName(instance)

      if (!evolutionInstanceName) {
        return res.status(400).json({ error: 'Instância Evolution inválida' })
      }

      const payload = {
        number,
        sticker,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
        quoted
      }

      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined || payload[key] === null || (Array.isArray(payload[key]) && payload[key].length === 0)) {
          delete payload[key]
        }
      })

      const evolutionResponse = await evolutionApi.sendSticker(
        evolutionInstanceName,
        payload
      )

      res.status(200).json({
        number,
        chatId: chatId || number,
        evolution: evolutionResponse
      })
    } catch (error) {
      console.error('Erro ao enviar sticker (API):', error.response?.data || error.message)
      const status = error.response?.status || 500
      res.status(status).json({
        error: error.response?.data?.error || 'Erro ao enviar sticker',
        details: error.response?.data || error.message
      })
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
      const evolutionInstanceName = MessageController.getEvolutionInstanceName(instance)

      if (!evolutionInstanceName) {
        return res.status(400).json({ error: 'Instância Evolution inválida' })
      }

      const evolutionMessages = await evolutionApi.getChatMessages(
        evolutionInstanceName,
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
      const evolutionInstanceName = MessageController.getEvolutionInstanceName(instance)

      if (!evolutionInstanceName) {
        return res.status(400).json({ error: 'Instância Evolution inválida' })
      }

      const mediaStream = await evolutionApi.downloadMedia(
        evolutionInstanceName,
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

  // Obter mídia em base64 da Evolution API
  async getBase64FromMedia(req, res) {
    try {
      const { instanceId, messageId } = req.params
      const { convertToMp4 } = req.query

      console.log(`📷 MessageController.getBase64FromMedia RECEBIDO:`, {
        instanceId,
        messageId,
        convertToMp4: convertToMp4 === 'true',
        query: req.query,
        body: req.body,
        headers: req.headers
      })

      // Verificar se usuário tem acesso à instância (se não for autenticação via API)
      if (req.user?.role !== 'admin' && req.user?.id) {
        const instance = await Instance.findById(instanceId)
        if (!instance || instance.user_id !== req.user.id) {
          console.log(`❌ Instância não encontrada ou sem permissão: ${instanceId}`)
          return res.status(404).json({ error: 'Instância não encontrada' })
        }
      }

      // Buscar instância para obter o nome para a Evolution API
      const instance = await Instance.findById(instanceId)
      
      if (!instance) {
        return res.status(404).json({ error: 'Instância não encontrada' })
      }
      
      console.log(`🔍 Dados da instância:`, {
        id: instance.id,
        name: instance.name, 
        evolution_instance_id: instance.evolution_instance_id
      })

      try {
        console.log(`📝 Verificando formatação do messageId: "${messageId}"`)
        
        // Determinar se deve converter para MP4 com base no parâmetro da query
        const shouldConvertToMp4 = req.query.convertToMp4 === 'true'
        console.log(`🎬 Converter para MP4: ${shouldConvertToMp4}`)
        
        // Fazer chamada para Evolution API usando evolution_instance_id
        const base64Data = await evolutionApi.getBase64FromMediaMessage(
          instance.evolution_instance_id, 
          messageId,
          shouldConvertToMp4
        )
        
        console.log(`📷 Base64 obtido com sucesso da Evolution API para messageId: ${messageId}`)
        
        res.json(base64Data)
      } catch (evolutionError) {
        console.error('Erro na Evolution API:', evolutionError)
        
        if (evolutionError.response?.status === 404) {
          return res.status(404).json({ error: 'Mensagem ou mídia não encontrada' })
        }
        
        return res.status(500).json({ 
          error: 'Erro ao obter mídia da Evolution API',
          details: evolutionError.message 
        })
      }
    } catch (error) {
      console.error('Erro ao obter base64 da mídia:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
}

module.exports = new MessageController()
