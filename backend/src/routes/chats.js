const express = require('express')
const ChatController = require('../controllers/ChatController')
const { hybridAuth } = require('../middleware/iframeAuth')

const router = express.Router()

// Middleware de autenticação híbrida (API Key ou JWT) para todas as rotas
router.use(hybridAuth)

// Rotas de chats
router.get('/:instanceId/chats', ChatController.getChats)
router.post('/:instanceId/chats/sync', ChatController.syncChats)
router.get('/:instanceId/chats/:chatId', ChatController.getChat)
router.put('/:instanceId/chats/:chatId/read', ChatController.markAsRead)
router.put('/:instanceId/chats/:chatId/archive', ChatController.toggleArchive)
router.put('/:instanceId/chats/:chatId/pin', ChatController.togglePin)
router.post('/:instanceId/chats/:chatId/presence', ChatController.setPresence)

module.exports = router
