import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import apiService from '../services/api'
import socketService from '../services/socket'
import notificationService from '../services/notification'
import { useAuth } from './AuthContext'
import { useSocket } from './SocketContext'

// Estado inicial
const initialState = {
  // Instâncias
  instances: [],
  currentInstance: null,
  instanceLoading: false,

  // Chats
  chats: [],
  currentChat: null,
  chatLoading: false,
  syncingChats: false,
  highlightSyncButton: false,

  // Progresso de sincronização
  syncProgress: {
    isVisible: false,
    type: 'manual', // 'manual' | 'auto'
    status: 'idle', // 'idle' | 'starting' | 'processing' | 'finalizing' | 'completed' | 'error'
    step: '',
    progress: 0,
    contactsProcessed: 0,
    chatsProcessed: 0,
    totalContacts: 0,
    totalChats: 0,
    error: null
  },

  // Contatos
  contacts: [],
  contactsLoading: false,

  // Usuário
  user: null,

  // Mensagens
  messages: [],
  messageLoading: false,

  // UI
  sidebarOpen: true,
  darkMode: false,

  // Conectividade
  socketConnected: false,

  // Busca
  searchQuery: '',
  searchResults: [],

  // Notificações
  notifications: [],

  // Typing indicators
  typingUsers: new Map(),

  // Erro global
  error: null
}

// Actions
const appActions = {
  // Instâncias
  SET_INSTANCES: 'SET_INSTANCES',
  SET_CURRENT_INSTANCE: 'SET_CURRENT_INSTANCE',
  UPDATE_INSTANCE: 'UPDATE_INSTANCE',
  REMOVE_INSTANCE: 'REMOVE_INSTANCE',
  SET_INSTANCE_LOADING: 'SET_INSTANCE_LOADING',

  // Chats
  SET_CHATS: 'SET_CHATS',
  SET_CURRENT_CHAT: 'SET_CURRENT_CHAT',
  UPDATE_CHAT: 'UPDATE_CHAT',
  ADD_CHAT: 'ADD_CHAT',
  SET_CHAT_LOADING: 'SET_CHAT_LOADING',
  SET_SYNCING_CHATS: 'SET_SYNCING_CHATS',

  // Progresso de sincronização
  SET_SYNC_PROGRESS: 'SET_SYNC_PROGRESS',
  RESET_SYNC_PROGRESS: 'RESET_SYNC_PROGRESS',
  START_SYNC_PROGRESS: 'START_SYNC_PROGRESS',
  COMPLETE_SYNC_PROGRESS: 'COMPLETE_SYNC_PROGRESS',
  HIGHLIGHT_SYNC_BUTTON: 'HIGHLIGHT_SYNC_BUTTON',

  // Contatos
  SET_CONTACTS: 'SET_CONTACTS',
  SET_CONTACTS_LOADING: 'SET_CONTACTS_LOADING',

  // Usuário
  SET_USER_PROFILE: 'SET_USER_PROFILE',

  // Mensagens
  SET_MESSAGES: 'SET_MESSAGES',
  ADD_MESSAGE: 'ADD_MESSAGE',
  UPDATE_MESSAGE: 'UPDATE_MESSAGE',
  PREPEND_MESSAGES: 'PREPEND_MESSAGES',
  SET_MESSAGE_LOADING: 'SET_MESSAGE_LOADING',

  // UI
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
  SET_SIDEBAR: 'SET_SIDEBAR',
  TOGGLE_DARK_MODE: 'TOGGLE_DARK_MODE',
  SET_DARK_MODE: 'SET_DARK_MODE',

  // Socket
  SET_SOCKET_CONNECTED: 'SET_SOCKET_CONNECTED',

  // Busca
  SET_SEARCH_QUERY: 'SET_SEARCH_QUERY',
  SET_SEARCH_RESULTS: 'SET_SEARCH_RESULTS',

  // Notificações
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
  CLEAR_NOTIFICATIONS: 'CLEAR_NOTIFICATIONS',

  // Typing
  SET_USER_TYPING: 'SET_USER_TYPING',
  CLEAR_USER_TYPING: 'CLEAR_USER_TYPING',

  // Erro
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR'
}

// Reducer
function appReducer(state, action) {
  switch (action.type) {
    case appActions.SET_INSTANCES:
      console.log('SET_INSTANCES:', action.payload?.length || 0, 'instâncias')
      return { ...state, instances: action.payload }

    case appActions.SET_CURRENT_INSTANCE:
      console.log('SET_CURRENT_INSTANCE:', action.payload?.name || 'null')
      return { ...state, currentInstance: action.payload }

    case appActions.UPDATE_INSTANCE:
      return {
        ...state,
        instances: state.instances.map(instance =>
          instance.id === action.payload.id
            ? { ...instance, ...action.payload.data }
            : instance
        ),
        currentInstance:
          state.currentInstance?.id === action.payload.id
            ? { ...state.currentInstance, ...action.payload.data }
            : state.currentInstance
      }

    case appActions.REMOVE_INSTANCE:
      return {
        ...state,
        instances: state.instances.filter(
          instance => instance.id !== action.payload
        ),
        currentInstance:
          state.currentInstance?.id === action.payload
            ? null
            : state.currentInstance
      }

    case appActions.SET_INSTANCE_LOADING:
      return { ...state, instanceLoading: action.payload }

    case appActions.SET_CHATS:
      return { ...state, chats: action.payload }

    case appActions.SET_CURRENT_CHAT:
      return { ...state, currentChat: action.payload, messages: [] }

    case appActions.UPDATE_CHAT:
      return {
        ...state,
        chats: state.chats.map(chat =>
          chat.id === action.payload.id
            ? { ...chat, ...action.payload.data }
            : chat
        ),
        currentChat:
          state.currentChat?.id === action.payload.id
            ? { ...state.currentChat, ...action.payload.data }
            : state.currentChat
      }

    case appActions.ADD_CHAT:
      return {
        ...state,
        chats: [
          action.payload,
          ...state.chats.filter(chat => chat.id !== action.payload.id)
        ]
      }

    case appActions.SET_CHAT_LOADING:
      return { ...state, chatLoading: action.payload }

    case appActions.SET_SYNCING_CHATS:
      return { ...state, syncingChats: action.payload }

    // Casos de progresso de sincronização
    case appActions.SET_SYNC_PROGRESS:
      console.log('📊 Reducer SET_SYNC_PROGRESS:', action.payload)

      // Garante valores mínimos para os campos numéricos
      const sanitizedPayload = {
        ...action.payload,
        progress: typeof action.payload.progress === 'number' ? action.payload.progress : 0,
        contactsProcessed: Number(action.payload.contactsProcessed) || 0,
        totalContacts: Number(action.payload.totalContacts) || 0,
        chatsProcessed: Number(action.payload.chatsProcessed) || 0,
        totalChats: Number(action.payload.totalChats) || 0
      };

      // Para debug
      const currentProgress = state.syncProgress.progress;
      const newProgress = sanitizedPayload.progress;
      if (currentProgress !== newProgress) {
        console.log(`📊 Progresso mudando de ${currentProgress}% para ${newProgress}%`);
      }

      const newProgressState = {
        ...state,
        syncProgress: {
          ...state.syncProgress,
          ...sanitizedPayload,
          isVisible: true  // Garante que sempre fica visível
        }
      }

      console.log('📊 Novo estado após SET:', newProgressState.syncProgress)
      console.log('📈 Progresso atual:', newProgressState.syncProgress.progress + '%')
      return newProgressState

    case appActions.START_SYNC_PROGRESS:
      console.log('🔄 Reducer START_SYNC_PROGRESS:', action.payload)
      const newStartState = {
        ...state,
        syncProgress: {
          ...initialState.syncProgress,
          isVisible: true,
          type: action.payload.type || 'manual',
          status: 'starting',
          step: 'Iniciando sincronização...',
          progress: 0
        }
      }
      console.log('🔄 Novo estado após START:', newStartState.syncProgress)
      return newStartState

    case appActions.COMPLETE_SYNC_PROGRESS:
      console.log('✅ Reducer COMPLETE_SYNC_PROGRESS:', action.payload, 'Definindo progresso para 100%')
      return {
        ...state,
        syncProgress: {
          ...state.syncProgress,
          status: action.payload.success ? 'completed' : 'error',
          step: action.payload.success ? 'Sincronização concluída!' : 'Erro na sincronização',
          progress: action.payload.success ? 100 : 0,
          error: action.payload.error || null
        }
      }

    case appActions.RESET_SYNC_PROGRESS:
      return {
        ...state,
        syncProgress: initialState.syncProgress
      }

    case appActions.SET_CONTACTS:
      return { ...state, contacts: action.payload }

    case appActions.SET_CONTACTS_LOADING:
      return { ...state, contactsLoading: action.payload }

    case appActions.SET_USER_PROFILE:
      return { ...state, user: action.payload }

    case appActions.SET_MESSAGES:
      return { ...state, messages: action.payload }

    case appActions.ADD_MESSAGE:
      return {
        ...state,
        messages: [...state.messages, action.payload]
      }

    case appActions.UPDATE_MESSAGE:
      return {
        ...state,
        messages: state.messages.map(message =>
          message.id === action.payload.id
            ? { ...message, ...action.payload.data }
            : message
        )
      }

    case appActions.PREPEND_MESSAGES:
      return {
        ...state,
        messages: [...action.payload, ...state.messages]
      }

    case appActions.SET_MESSAGE_LOADING:
      return { ...state, messageLoading: action.payload }

    case appActions.TOGGLE_SIDEBAR:
      return { ...state, sidebarOpen: !state.sidebarOpen }

    case appActions.SET_SIDEBAR:
      return { ...state, sidebarOpen: action.payload }

    case appActions.TOGGLE_DARK_MODE:
      return { ...state, darkMode: !state.darkMode }

    case appActions.SET_DARK_MODE:
      return { ...state, darkMode: action.payload }

    case appActions.HIGHLIGHT_SYNC_BUTTON:
      return { ...state, highlightSyncButton: action.payload }

    case appActions.SET_SOCKET_CONNECTED:
      return { ...state, socketConnected: action.payload }

    case appActions.SET_SEARCH_QUERY:
      return { ...state, searchQuery: action.payload }

    case appActions.SET_SEARCH_RESULTS:
      return { ...state, searchResults: action.payload }

    case appActions.ADD_NOTIFICATION:
      return {
        ...state,
        notifications: [...state.notifications, action.payload]
      }

    case appActions.REMOVE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload)
      }

    case appActions.CLEAR_NOTIFICATIONS:
      return { ...state, notifications: [] }

    case appActions.SET_USER_TYPING:
      const newTypingUsers = new Map(state.typingUsers)
      newTypingUsers.set(action.payload.chatId, action.payload.users)
      return { ...state, typingUsers: newTypingUsers }

    case appActions.CLEAR_USER_TYPING:
      const clearedTypingUsers = new Map(state.typingUsers)
      clearedTypingUsers.delete(action.payload.chatId)
      return { ...state, typingUsers: clearedTypingUsers }

    case appActions.SET_ERROR:
      return { ...state, error: action.payload }

    case appActions.CLEAR_ERROR:
      return { ...state, error: null }

    default:
      return state
  }
}

// Contexto
const AppContext = createContext()

// Provider
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const { isAuthenticated } = useAuth()
  const { isConnected, emit } = useSocket()

  // Ref para controle de sincronização global
  const syncLockRef = useRef(new Set()) // Set para rastrear instâncias em sync

  // Carregar tema do localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('whatsapp_theme')
    if (savedTheme) {
      dispatch({
        type: appActions.SET_DARK_MODE,
        payload: savedTheme === 'dark'
      })
    }
  }, [])

  // Salvar instância atual no localStorage
  useEffect(() => {
    if (state.currentInstance) {
      localStorage.setItem('whatsapp_current_instance', state.currentInstance.id)
    } else {
      localStorage.removeItem('whatsapp_current_instance')
    }
  }, [state.currentInstance])

  // Aplicar tema
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.darkMode)
    localStorage.setItem('whatsapp_theme', state.darkMode ? 'dark' : 'light')
  }, [state.darkMode])

  // Carregar instâncias automaticamente quando autenticado
  useEffect(() => {
    if (isAuthenticated && state.instances.length === 0) {
      console.log('Usuário autenticado, carregando instâncias...')
      loadInstances()
    }
  }, [isAuthenticated])

  // Polling para verificar status das instâncias que estão em estados transitórios
  useEffect(() => {
    if (!isAuthenticated || !state.instances.length) return

    const instancesToMonitor = state.instances.filter(inst =>
      inst.status === 'connecting' || (inst.status === 'disconnected' && !inst.orphaned)
    )

    if (instancesToMonitor.length === 0) return

    const interval = setInterval(() => {
      instancesToMonitor.forEach(instance => {
        checkInstanceStatus(instance.id)
      })
    }, 15000) // Verificar a cada 15 segundos

    return () => clearInterval(interval)
  }, [state.instances, isAuthenticated])

  // Se não há instância selecionada mas há instâncias disponíveis, selecionar a primeira
  useEffect(() => {
    if (isAuthenticated && state.instances.length > 0 && !state.currentInstance) {
      const savedInstanceId = localStorage.getItem('whatsapp_current_instance')
      let instanceToSelect = null

      if (savedInstanceId) {
        instanceToSelect = state.instances.find(inst => inst.id === savedInstanceId)
      }

      // Se não encontrou a instância salva, pega a primeira
      if (!instanceToSelect) {
        instanceToSelect = state.instances[0]
      }

      if (instanceToSelect) {
        console.log('Selecionando instância:', instanceToSelect.name)
        selectInstance(instanceToSelect)
      }
    }
  }, [isAuthenticated, state.instances, state.currentInstance])

  // Configurar listeners do socket
  useEffect(() => {
    if (!isAuthenticated) return

    console.log('🎧 Configurando listeners do socket - isConnected:', isConnected)

    // Status da conexão
    socketService.on('connection_status', data => {
      dispatch({
        type: appActions.SET_SOCKET_CONNECTED,
        payload: data.connected
      })
    })

    // Nova mensagem
    socketService.on('new_message', data => {
      dispatch({ type: appActions.ADD_MESSAGE, payload: data.message })

      // Atualizar chat
      if (data.chatId) {
        updateChatLastMessage(data.chatId, data.message)
      }

      // Mostrar notificação se necessário
      if (!data.message.fromMe && notificationService.isUserAway()) {
        notificationService.showMessageNotification(
          data.message.Contact,
          data.message.content || data.message.messageType
        )
      }
    })

    // Atualização de mensagem
    socketService.on('message_update', data => {
      dispatch({
        type: appActions.UPDATE_MESSAGE,
        payload: { id: data.messageId, data: { status: data.status } }
      })
    })

    // Atualização de conexão da instância
    socketService.on('connection_update', data => {
      dispatch({
        type: appActions.UPDATE_INSTANCE,
        payload: {
          id: data.instanceId,
          data: { status: data.status, phone: data.phone }
        }
      })

      if (data.status === 'connected') {
        console.log('🔌 Evento connection_update: instância conectada', data)
        notificationService.showSuccess(`Instância conectada: ${data.phone}`, {
          duration: 5000,
          position: 'top-center'
        })

        // CRITICAL: Mostrar notificação de sincronização imediatamente após conectar
        // Isso irá funcionar independentemente do QR code ou refresh
        console.log('✨ Mostrando orientação de sincronização após conexão')
        
        // Destacar visualmente o botão de sincronização imediatamente
        dispatch({ 
          type: appActions.HIGHLIGHT_SYNC_BUTTON, 
          payload: true 
        })
        
        // Sequência de notificações tutoriais para guiar o usuário
        // Primeira notificação: celebração da conexão
        setTimeout(() => {
          notificationService.showInfo(
            '🎉 Conexão estabelecida com sucesso! Agora você pode sincronizar seus contatos e conversas.',
            {
              id: 'connection-success',
              duration: 6000,
              position: 'top-center',
              icon: '🎉'
            }
          )
        }, 1000)
        
        // Segunda notificação: orientação para sincronizar
        setTimeout(() => {
          notificationService.showInfo(
            '✨ Para ver suas conversas, clique no botão de sincronização destacado na barra lateral. 👈',
            {
              id: 'sync-tutorial-1',
              duration: 8000,
              position: 'top-center',
              icon: '👆'
            }
          )
        }, 7500) // Após a primeira notificação
        
        // Terceira notificação (opcional): dica adicional se o usuário ainda não clicou
        setTimeout(() => {
          // Verificar se ainda precisamos mostrar a dica (se o usuário não clicou ainda)
          if (state.highlightSyncButton) {
            notificationService.showInfo(
              'Dica: O botão de sincronização está piscando. Clique nele para carregar suas conversas! 📱',
              {
                id: 'sync-tutorial-2',
                duration: 10000,
                position: 'top-center',
                icon: '💡'
              }
            )
          }
        }, 17000) // Um pouco mais tarde
        
        // Remover o destaque após um tempo maior, caso o usuário não interaja
        setTimeout(() => {
          dispatch({ 
            type: appActions.HIGHLIGHT_SYNC_BUTTON, 
            payload: false 
          })
        }, 30000) // Manter o destaque por 30 segundos
        
        // Se for a instância atual, carrega automaticamente o perfil
        if (data.instanceId === state.currentInstance?.id) {
          console.log('🔄 Auto-carregando perfil após conexão')
          setTimeout(() => {
            loadUserProfile(data.instanceId)
            // A sincronização será iniciada automaticamente pelo backend
            // através do WebhookController que já tem essa funcionalidade
          }, 2000) // Aguarda 2 segundos para garantir que está totalmente conectado
        }
      } else if (data.status === 'disconnected') {
        notificationService.showWarning('Instância desconectada', {
          position: 'top-center',
          duration: 5000
        })
      }
    })

    // QR Code atualizado
    socketService.on('qrcode_updated', data => {
      dispatch({
        type: appActions.UPDATE_INSTANCE,
        payload: { id: data.instanceId, data: { qrCode: data.qrCode } }
      })
    })

    // Atualização de chats em tempo real
    socketService.on('chats_update', data => {
      const timestamp = new Date().toISOString();
      console.log(`📱 [${timestamp}] Chats atualizados via WebSocket:`, data)

      // Verificar se a instância é a atual OU a última que iniciou sincronização
      const isTargetInstance = (data.instanceId === state.currentInstance?.id || 
                               data.instanceId === window.lastSyncInstanceId);
      
      if (isTargetInstance) {
        console.log(`✅ [${timestamp}] Recebido evento chats_update para instância relevante: ${data.instanceId}`)
        
        // Parar estado de sincronização se estiver ativo
        dispatch({ type: appActions.SET_SYNCING_CHATS, payload: false })

        // Verificar se há sincronização em andamento (independente do progresso)
        if (state.syncProgress.isVisible && state.syncProgress.progress > 0) {
          console.log(`🏁 [${timestamp}] Detectada sincronização em andamento em ${state.syncProgress.progress}%, forçando conclusão`)
          
          // Forçar progresso para 100%
          dispatch({
            type: appActions.SET_SYNC_PROGRESS,
            payload: {
              isVisible: true,
              status: 'completed',
              step: 'Sincronização concluída com sucesso!',
              progress: 100
            }
          });
          
          // Completar imediatamente para garantir atualização
          dispatch({
            type: appActions.COMPLETE_SYNC_PROGRESS,
            payload: {
              success: true,
              error: null
            }
          });
          
          // Recarregar chats e mostrar notificação
          setTimeout(() => {
            // Limpar variável de lastSyncInstanceId quando concluir
            if (window.lastSyncInstanceId) {
              console.log(`🧹 [${new Date().toISOString()}] Limpando ID da última instância sincronizada:`, window.lastSyncInstanceId);
              window.lastSyncInstanceId = null;
            }
            
            // Recarregar chats
            console.log(`🔄 [${new Date().toISOString()}] Recarregando chats após evento chats_update`);
            loadChatsLocal(data.instanceId);
            
            // Mostrar notificação de sucesso
            notificationService.showSuccess(
              '✅ Suas conversas foram sincronizadas com sucesso!',
              {
                id: 'sync-success',
                duration: 6000,
                position: 'top-center'
              }
            );
          }, 500);
        }

        // Carregar chats apenas locais (sem sync automático) já que foi via WebSocket
        console.log(`🔄 [${timestamp}] Carregando chats locais após update via WebSocket`)
        loadChatsLocal(data.instanceId)

        // Mostrar notificação de sucesso se houver informações de sincronização
        if (data.syncedCount !== undefined || data.updatedCount !== undefined) {
          notificationService.showSuccess(`Sincronização concluída: ${data.syncedCount || 0} novos, ${data.updatedCount || 0} atualizados`)
        }
      } else {
        console.log(`ℹ️ [${timestamp}] Ignorando evento chats_update para instância diferente: ${data.instanceId}`)
      }
    })

    // Usuário digitando
    socketService.on('user_typing', data => {
      if (data.isTyping) {
        dispatch({
          type: appActions.SET_USER_TYPING,
          payload: { chatId: data.chatId, users: [data.user] }
        })

        // Limpar após 3 segundos
        setTimeout(() => {
          dispatch({
            type: appActions.CLEAR_USER_TYPING,
            payload: { chatId: data.chatId }
          })
        }, 3000)
      } else {
        dispatch({
          type: appActions.CLEAR_USER_TYPING,
          payload: { chatId: data.chatId }
        })
      }
    })

    // Eventos de progresso de sincronização
    socketService.on('SYNC_START', data => {
      const timestamp = new Date().toISOString();
      console.log(`🚀 Frontend recebeu SYNC_START [${timestamp}]:`, data)
      console.log('🎯 Instância atual:', state.currentInstance?.id)
      
      // Armazenar a instância que está iniciando sincronização (mesmo se não for a atual)
      if (data.instanceId) {
        window.lastSyncInstanceId = data.instanceId;
        console.log(`📌 [${timestamp}] Armazenando ID da instância em sincronização:`, window.lastSyncInstanceId);
      }
      
      // Permitir iniciar o progresso para a instância atual OU para a última instância que iniciou sincronização
      if (data.instanceId === state.currentInstance?.id || data.instanceId === window.lastSyncInstanceId) {
        console.log(`✅ [${timestamp}] Iniciando progresso para instância:`, data.instanceId)
        dispatch({
          type: appActions.START_SYNC_PROGRESS,
          payload: { type: data.type }
        })
      } else {
        console.log('❌ Evento para instância diferente:', data.instanceId, 'vs', state.currentInstance?.id)
      }
    })

    socketService.on('SYNC_PROGRESS', data => {
      const timestamp = new Date().toISOString();
      console.log(`📊 Frontend recebeu SYNC_PROGRESS [${timestamp}]:`, data)
      console.log(`🎯 Instância atual: ${state.currentInstance?.id}, Progresso: ${data.progress}%, Status: ${data.status}`)

      // Armazenar a última instância que enviou progresso (para casos onde state.currentInstance é undefined)
      if (!window.lastSyncInstanceId && data.instanceId) {
        window.lastSyncInstanceId = data.instanceId;
        console.log(`📌 [${timestamp}] Armazenando ID da instância em sincronização:`, window.lastSyncInstanceId);
      }

      // Forçar exibir o progresso independente da instância em modo iframe
      const isIframeMode = window.location.search.includes('iframe=true');

      // Permitir progresso para a instância atual OU para a última instância que iniciou sincronização
      if (data.instanceId === state.currentInstance?.id || data.instanceId === window.lastSyncInstanceId || isIframeMode) {
        console.log(`✅ [${timestamp}] Atualizando progresso para instância`, data.instanceId)
        console.log(`📈 Progresso: ${data.progress}%, Status: ${data.status}, Etapa: ${data.step}`)
        console.log(`📊 Contatos: ${data.contactsProcessed}/${data.totalContacts}, Chats: ${data.chatsProcessed}/${data.totalChats}`)

        // Atualizar imediatamente o estado para refletir o progresso
        dispatch({
          type: appActions.SET_SYNC_PROGRESS,
          payload: {
            isVisible: true,
            type: data.type || 'manual',
            status: data.status,
            step: data.step,
            progress: Number(data.progress),
            contactsProcessed: data.contactsProcessed,
            chatsProcessed: data.chatsProcessed,
            totalContacts: data.totalContacts,
            totalChats: data.totalChats
          }
        })
        
        // Se for a etapa final (95% ou mais), preparar para forçar a conclusão caso não receba o evento SYNC_COMPLETE
        if (Number(data.progress) >= 95) {
          console.log(`⏱️ [${timestamp}] Progresso em ${data.progress}%, configurando timer de segurança para conclusão`)
          
          // Após 3 segundos, se ainda estiver em 95% ou mais, mas não tiver chegado a 100%, forçar a conclusão
          setTimeout(() => {
            // Verificar se o progresso ainda está em 95-99%
            if (state.syncProgress.progress >= 95 && state.syncProgress.progress < 100) {
              console.log(`⚠️ [${new Date().toISOString()}] Progresso ainda em ${state.syncProgress.progress}% após timeout, forçando conclusão`)
              
              // Forçar a conclusão
              dispatch({
                type: appActions.SET_SYNC_PROGRESS,
                payload: {
                  isVisible: true,
                  status: 'completed',
                  step: 'Sincronização concluída com sucesso!',
                  progress: 100
                }
              });
              
              // Completar o progresso
              dispatch({
                type: appActions.COMPLETE_SYNC_PROGRESS,
                payload: {
                  success: true,
                  error: null
                }
              });
              
              // Recarregar os chats para garantir que tudo esteja atualizado
              setTimeout(() => {
                console.log(`🔄 [${new Date().toISOString()}] Recarregando chats após forçar conclusão`)
                
                // Limpar variável de lastSyncInstanceId quando concluir
                if (window.lastSyncInstanceId) {
                  console.log(`🧹 [${new Date().toISOString()}] Limpando ID da última instância sincronizada:`, window.lastSyncInstanceId);
                  const instanceToLoad = window.lastSyncInstanceId;
                  window.lastSyncInstanceId = null;
                  loadChats(instanceToLoad);
                } else {
                  loadChats(data.instanceId);
                }
                
                // Mostrar notificação de sucesso
                notificationService.showSuccess(
                  '✅ Sincronização concluída! Suas conversas foram carregadas com sucesso.',
                  {
                    id: 'sync-success-timeout',
                    duration: 6000,
                    position: 'top-center'
                  }
                );
              }, 500);
            }
          }, 3000);
        }
      } else {
        console.log(`❌ [${timestamp}] Evento para instância diferente:`, data.instanceId, 'vs', state.currentInstance?.id)
      }
    })

    socketService.on('SYNC_COMPLETE', data => {
      const timestamp = new Date().toISOString();
      console.log('✅ Frontend recebeu SYNC_COMPLETE:', data, 'Timestamp:', timestamp)
      console.log('🎯 Instância atual:', state.currentInstance?.id)
      
      // Permitir conclusão para a instância atual OU para a última instância que iniciou sincronização
      if (data.instanceId === state.currentInstance?.id || data.instanceId === window.lastSyncInstanceId) {
        console.log(`✅ [${timestamp}] Finalizando progresso para instância:`, data.instanceId)
        
        // Garante que o progresso visual seja 100% imediatamente
        dispatch({
          type: appActions.SET_SYNC_PROGRESS,
          payload: {
            isVisible: true,
            status: 'completed',
            step: 'Sincronização concluída com sucesso!',
            progress: 100
          }
        });
        
        // Após um pequeno delay para garantir a atualização visual, dispara o evento de conclusão
        setTimeout(() => {
          console.log('🏁 Disparando evento COMPLETE_SYNC_PROGRESS após garantir atualização visual')
          dispatch({
            type: appActions.COMPLETE_SYNC_PROGRESS,
            payload: {
              success: data.status === 'completed',
              error: data.error
            }
          })
        }, 200);

        // Esconder progresso após 5 segundos se foi sucesso, 10 segundos se erro
        const hideDelay = data.status === 'completed' ? 5000 : 10000
        setTimeout(() => {
          console.log('🔄 Resetando progresso após timeout')
          dispatch({ type: appActions.RESET_SYNC_PROGRESS })
        }, hideDelay)

        // Parar estado de sincronização legado
        dispatch({ type: appActions.SET_SYNCING_CHATS, payload: false })

        // Recarregar dados após sincronização bem sucedida
        if (data.status === 'completed') {
          loadChats(data.instanceId)

          // Auto-refresh do perfil do usuário
          if (state.currentInstance?.status === 'connected') {
            console.log('🔄 Auto-carregando perfil após sincronização')
            loadUserProfile(data.instanceId)
          }
        }
      }
    })

    return () => {
      socketService.clearListeners()
    }
  }, [isAuthenticated])

  // Carregar instâncias
  const loadInstances = async () => {
    try {
      dispatch({ type: appActions.SET_INSTANCE_LOADING, payload: true })
      const response = await apiService.getInstances()
      dispatch({ type: appActions.SET_INSTANCES, payload: response.instances })

      // Verificar status de todas as instâncias que não estão conectadas
      const instancesToCheck = response.instances.filter(inst =>
        inst.status === 'connecting' || inst.status === 'disconnected'
      )

      // Atualizar status das instâncias que podem ter mudado
      instancesToCheck.forEach(instance => {
        setTimeout(() => checkInstanceStatus(instance.id), 1000)
      })

    } catch (error) {
      notificationService.showError('Erro ao carregar instâncias')
    } finally {
      dispatch({ type: appActions.SET_INSTANCE_LOADING, payload: false })
    }
  }

  // Criar nova instância
  const createInstance = async (instanceName) => {
    try {
      dispatch({ type: appActions.SET_INSTANCE_LOADING, payload: true })
      const response = await apiService.createInstance({ name: instanceName })

      // Recarregar lista de instâncias
      await loadInstances()

      // Selecionar a nova instância
      if (response.instance) {
        await selectInstance(response.instance)
      }

      notificationService.showSuccess('Instância criada com sucesso!')
      return response
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Erro ao criar instância'
      notificationService.showError(errorMessage)
      throw error
    } finally {
      dispatch({ type: appActions.SET_INSTANCE_LOADING, payload: false })
    }
  }

  // Conectar instância
  const connectInstance = async (instanceId) => {
    try {
      const response = await apiService.connectInstance(instanceId)

      // Atualizar a instância na lista
      dispatch({
        type: appActions.UPDATE_INSTANCE,
        payload: { id: instanceId, data: { status: 'connecting' } }
      })

      notificationService.showInfo('Conectando instância...')
      return response
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Erro ao conectar instância'
      notificationService.showError(errorMessage)
      throw error
    }
  }

  // Selecionar instância
  const selectInstance = async instance => {
    console.log('selectInstance chamado com:', instance?.name || 'null')
    dispatch({ type: appActions.SET_CURRENT_INSTANCE, payload: instance })

    // Entrar na sala da instância no socket
    if (instance) {
      console.log('Entrando na sala do socket para instância:', instance.id)

      // Verificar se o socket está conectado antes de entrar nas salas
      console.log('🔍 Estado do socket - isConnected:', isConnected)
      console.log('🔍 socketService.socket:', socketService.socket?.connected)

      if (isConnected) {
        socketService.joinInstance(instance.id)
        socketService.joinSyncProgress(instance.id)
        console.log('✅ Entrando na sala de progresso para instância:', instance.id)
      } else {
        console.warn('⚠️ Socket não conectado, não foi possível entrar nas salas')
        // Tentar novamente após um tempo
        setTimeout(() => {
          if (isConnected) {
            console.log('🔄 Tentando novamente entrar nas salas do socket...')
            socketService.joinInstance(instance.id)
            socketService.joinSyncProgress(instance.id)
            console.log('✅ Entrando na sala de progresso para instância (retry):', instance.id)
          }
        }, 2000)
      }

      // Carregar chats da instância
      if (instance.id) {
        console.log('Carregando chats para instância:', instance.id)
        loadChats(instance.id)
      }

      // Verificar status atual da instância imediatamente
      if (instance.id) {
        console.log('🔍 Verificando status atual da instância:', instance.id)
        checkInstanceStatus(instance.id)
      }

      // Carregar perfil do usuário
      if (instance.id && instance.status === 'connected') {
        console.log('Carregando perfil do usuário para instância:', instance.id)
        loadUserProfile(instance.id)
      }

      // Se não estiver conectada, tentar obter QR Code atual
      if (instance.status !== 'connected') {
        console.log('Instância não conectada, buscando QR Code')
        try {
          await fetchQRCode(instance.id)
        } catch (error) {
          console.log('Erro ao buscar QR Code:', error.message)
        }
      }
    }
  }

  // Carregar chats apenas locais (sem sync)
  const loadChatsLocal = async instanceId => {
    try {
      dispatch({ type: appActions.SET_CHAT_LOADING, payload: true })
      if (!instanceId) throw new Error('instanceId ausente')
      console.log('💾 Carregando chats locais para instanceId:', instanceId)

      const response = await apiService.getChats(instanceId)
      console.log('📱 Chats locais carregados:', response)

      dispatch({ type: appActions.SET_CHATS, payload: response.chats || [] })
    } catch (error) {
      console.error('❌ Erro ao carregar chats locais:', error)
    } finally {
      dispatch({ type: appActions.SET_CHAT_LOADING, payload: false })
    }
  }

  // Carregar chats
  const loadChats = async instanceId => {
    try {
      dispatch({ type: appActions.SET_CHAT_LOADING, payload: true })
      if (!instanceId) throw new Error('instanceId ausente')
      console.log('🔄 Carregando chats para instanceId:', instanceId)

      // Primeiro tentar carregar chats locais
      let response = await apiService.getChats(instanceId)
      console.log('📱 Chats locais:', response)
      
      // Verificar chats em formato de array
      const chatsArray = Array.isArray(response.chats) ? response.chats : 
                        (Array.isArray(response) ? response : []);
      
      // Ordena os chats por última mensagem se disponível
      const sortedChats = chatsArray.sort((a, b) => {
        const dateA = a.lastMessageTime ? new Date(a.lastMessageTime) : new Date(0);
        const dateB = b.lastMessageTime ? new Date(b.lastMessageTime) : new Date(0);
        return dateB - dateA;
      });
      
      // Atualizar estado com os chats ordenados
      dispatch({ type: appActions.SET_CHATS, payload: sortedChats || [] })

      // Verificar se deve mostrar notificação de orientação para sincronização
      try {
        const instanceInfo = await apiService.getInstanceStatus(instanceId)
        console.log('📱 Status da instância para orientação:', instanceInfo);
        
        // Se a instância está conectada e não há chats, mostrar dica de sincronização
        if (instanceInfo && instanceInfo.status === 'connected' && 
            (!sortedChats || sortedChats.length === 0)) {
          console.log('✨ Instância conectada sem chats, mostrando orientação para sincronizar');
          
          // Destaca o botão de sincronização
          dispatch({ 
            type: appActions.HIGHLIGHT_SYNC_BUTTON, 
            payload: true 
          });
          
          // Exibe notificação com duração mais longa e posição central
          setTimeout(() => {
            notificationService.showInfo(
              '✨ Sua instância está conectada! Clique no botão "Sincronizar" para carregar seus contatos e conversas do WhatsApp.',
              {
                id: 'sync-guidance-refresh',
                duration: 10000, // 10 segundos para garantir visibilidade
                position: 'top-center',
                icon: '🔄'
              }
            );
          }, 1000);
          
          // Exibe uma segunda notificação tutorial após um intervalo
          setTimeout(() => {
            notificationService.showInfo(
              'O botão de sincronização está destacado na barra lateral. Clique nele para continuar! 👈',
              {
                id: 'sync-button-highlight',
                duration: 8000,
                position: 'top-center',
                icon: '👆'
              }
            );
          }, 11500); // Exibe 1.5 segundos após a primeira notificação terminar
          
          // Reseta o destaque após um tempo maior
          setTimeout(() => {
            dispatch({ 
              type: appActions.HIGHLIGHT_SYNC_BUTTON, 
              payload: false 
            });
          }, 25000); // Manter o destaque por 25 segundos para dar tempo do usuário perceber
        }
      } catch (error) {
        console.error('❌ Erro ao verificar status para mostrar orientação:', error)
      }
    } catch (error) {
      console.error('❌ Erro ao carregar chats:', error)
      notificationService.showError('Erro ao carregar chats')
    } finally {
      dispatch({ type: appActions.SET_CHAT_LOADING, payload: false })
    }
  }

  // Função auxiliar para sync com retry e backoff
  const syncChatsWithRetry = async (instanceId, maxRetries = 3, baseDelay = 1000) => {
    // Verificar se já há uma sincronização em andamento para esta instância
    if (syncLockRef.current.has(instanceId)) {
      console.log(`⚠️ Sincronização já em andamento para instância ${instanceId}, ignorando nova solicitação`)
      return
    }

    // Adicionar ao lock global
    syncLockRef.current.add(instanceId)
    console.log(`🔒 Sync lock ativado para instância ${instanceId}. Locks ativos:`, Array.from(syncLockRef.current))

    dispatch({ type: appActions.SET_SYNCING_CHATS, payload: true })

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await apiService.syncChats(instanceId)
          return // Sucesso, sair do loop
        } catch (error) {
          if (error.response?.status === 429 && attempt < maxRetries) {
            // Rate limit atingido, fazer retry com backoff exponencial
            const delay = baseDelay * Math.pow(2, attempt - 1) // 1s, 2s, 4s
            console.log(`⏳ Rate limit atingido, tentando novamente em ${delay}ms (tentativa ${attempt}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            throw error // Re-lançar o erro se não for 429 ou se esgotaram as tentativas
          }
        }
      }
    } finally {
      // Remover do lock global
      syncLockRef.current.delete(instanceId)
      console.log(`🔓 Sync lock removido para instância ${instanceId}. Locks restantes:`, Array.from(syncLockRef.current))

      dispatch({ type: appActions.SET_SYNCING_CHATS, payload: false })
    }
  }

  // Carregar contatos
  const loadContacts = async instanceId => {
    try {
      dispatch({ type: appActions.SET_CONTACTS_LOADING, payload: true })
      if (!instanceId) throw new Error('instanceId ausente')
      console.log('🔄 Carregando contatos para instanceId:', instanceId)
      const response = await apiService.getContacts(instanceId)
      console.log('✅ Contatos carregados:', response)
      dispatch({ type: appActions.SET_CONTACTS, payload: response.contacts })
    } catch (error) {
      console.error('❌ Erro ao carregar contatos:', error)
      notificationService.showError('Erro ao carregar contatos')
    } finally {
      dispatch({ type: appActions.SET_CONTACTS_LOADING, payload: false })
    }
  }

  // Buscar QR Code atual da instância no backend
  const fetchQRCode = async (instanceId) => {
    if (!instanceId) return
    try {
      const data = await apiService.getQRCode(instanceId)
      const { qrCode, pairingCode, code } = data || {}
      dispatch({
        type: appActions.UPDATE_INSTANCE,
        payload: { id: instanceId, data: { qrCode: qrCode || null, pairingCode: pairingCode || null, pairingData: code || null } }
      })
    } catch (error) {
      // evitar ruído; QR pode não estar disponível ainda
    }
  }

  // Recriar instância órfã
  const recreateInstance = async (instanceId) => {
    try {
      console.log('🔄 Recriando instância órfã:', instanceId)
      const response = await apiService.recreateInstance(instanceId)
      console.log('✅ Instância recriada:', response)

      // Recarregar lista de instâncias
      await loadInstances()

      // Buscar novo QR Code
      await fetchQRCode(instanceId)

      return response
    } catch (error) {
      console.error('❌ Erro ao recriar instância:', error)
      notificationService.showError('Erro ao recriar instância')
      throw error
    }
  }

  // Sincronizar dados da instância com Evolution API
  const syncInstanceData = async (instanceId) => {
    try {
      console.log('🔄 Sincronizando dados da instância:', instanceId)
      const response = await apiService.syncInstanceData(instanceId)
      console.log('✅ Dados sincronizados:', response)

      // Atualizar instância no estado
      if (response.instance) {
        dispatch({
          type: appActions.UPDATE_INSTANCE,
          payload: {
            id: instanceId,
            data: response.instance
          }
        })
      }

      notificationService.showSuccess('Dados sincronizados com sucesso')
      return response
    } catch (error) {
      console.error('❌ Erro ao sincronizar dados:', error)
      const errorMessage = error.response?.data?.error || 'Erro ao sincronizar dados'
      notificationService.showError(errorMessage)
      throw error
    }
  }

  // Desconectar instância
  const disconnectInstance = async (instanceId) => {
    try {
      console.log('🔌 Desconectando instância:', instanceId)
      const response = await apiService.disconnectInstance(instanceId)

      // Atualizar status da instância
      dispatch({
        type: appActions.UPDATE_INSTANCE,
        payload: {
          id: instanceId,
          data: {
            status: 'disconnected',
            phone: null,
            qrCode: null
          }
        }
      })

      // Se a instância desconectada for a atual, limpar dados relacionados
      if (state.currentInstance?.id === instanceId) {
        dispatch({ type: appActions.SET_CHATS, payload: [] })
        dispatch({ type: appActions.SET_CURRENT_CHAT, payload: null })
        dispatch({ type: appActions.SET_MESSAGES, payload: [] })
        dispatch({ type: appActions.SET_USER_PROFILE, payload: null })
      }

      notificationService.showSuccess('Instância desconectada com sucesso')
      return response
    } catch (error) {
      console.error('❌ Erro ao desconectar instância:', error)
      const errorMessage = error.response?.data?.error || 'Erro ao desconectar instância'
      notificationService.showError(errorMessage)
      throw error
    }
  }

  // Deletar instância
  const deleteInstance = async (instanceId) => {
    try {
      console.log('🗑️ Deletando instância:', instanceId)
      const response = await apiService.deleteInstance(instanceId)

      // Remover instância da lista
      dispatch({
        type: appActions.REMOVE_INSTANCE,
        payload: instanceId
      })

      // Se a instância deletada for a atual, limpar tudo e selecionar outra
      if (state.currentInstance?.id === instanceId) {
        dispatch({ type: appActions.SET_CURRENT_INSTANCE, payload: null })
        dispatch({ type: appActions.SET_CHATS, payload: [] })
        dispatch({ type: appActions.SET_CURRENT_CHAT, payload: null })
        dispatch({ type: appActions.SET_MESSAGES, payload: [] })
        dispatch({ type: appActions.SET_USER_PROFILE, payload: null })

        // Tentar selecionar primeira instância disponível
        const remainingInstances = state.instances.filter(inst => inst.id !== instanceId)
        if (remainingInstances.length > 0) {
          await selectInstance(remainingInstances[0])
        }
      }

      notificationService.showSuccess('Instância deletada com sucesso')
      return response
    } catch (error) {
      console.error('❌ Erro ao deletar instância:', error)
      const errorMessage = error.response?.data?.error || 'Erro ao deletar instância'
      notificationService.showError(errorMessage)
      throw error
    }
  }

  // Carregar perfil do usuário da instância
  const loadUserProfile = async (instanceId) => {
    if (!instanceId) return
    try {
      // Somente buscar perfil quando efetivamente conectado
      const { status } = await apiService.getInstanceStatus(instanceId)
      if (status !== 'connected') {
        console.log('⚠️ Instância não conectada, pulando carregamento de perfil:', instanceId)
        return
      }
      console.log('🔄 Carregando perfil do usuário para instanceId:', instanceId)
      const profileData = await apiService.getProfileInfo(instanceId)
      console.log('✅ Perfil carregado:', profileData)

      // Atualizar estado do usuário
      dispatch({
        type: appActions.SET_USER_PROFILE,
        payload: {
          name: profileData.name || profileData.pushName || state.currentInstance?.profileName || 'Usuário',
          phone: profileData.number || profileData.phone || (state.currentInstance?.ownerJid ? state.currentInstance.ownerJid.replace('@s.whatsapp.net', '') : null),
          avatar: profileData.profilePictureUrl || profileData.profilePicture || state.currentInstance?.profilePictureUrl,
          status: profileData.status || 'Disponível'
        }
      })

      // Também atualizar a instância com os dados do perfil se necessário
      if (state.currentInstance && (profileData.profilePictureUrl || profileData.name)) {
        dispatch({
          type: appActions.UPDATE_INSTANCE,
          payload: {
            id: state.currentInstance.id,
            data: {
              profilePictureUrl: profileData.profilePictureUrl || state.currentInstance.profilePictureUrl,
              profileName: profileData.name || profileData.pushName || state.currentInstance.profileName
            }
          }
        })
      }
    } catch (error) {
      console.error('❌ Erro ao carregar perfil do usuário:', error.response?.status, error.response?.data?.error || error.message)
      // Não mostrar erro se for 400 (instância não conectada) ou 404 (não encontrada)
      if (error.response?.status !== 400 && error.response?.status !== 404) {
        console.error('Erro inesperado ao carregar perfil:', error)
      }
    }
  }

  // Verificar status de conexão da instância
  const checkInstanceStatus = async (instanceId) => {
    if (!instanceId) {
      console.warn('checkInstanceStatus: instanceId não fornecido')
      return
    }

    try {
      // console.log('Verificando status da instância:', instanceId)
      const response = await apiService.getInstanceStatus(instanceId)
      const { status, state, orphaned, message } = response
      // console.log('Status recebido:', { status, state, orphaned })

      dispatch({
        type: appActions.UPDATE_INSTANCE,
        payload: {
          id: instanceId,
          data: {
            status,
            orphaned: orphaned || false
          }
        }
      })

      if (orphaned) {
        notificationService.showError(message || 'Instância não encontrada no servidor')
      } else if (status === 'connecting') {
        notificationService.showInfo('Aguardando escaneamento do QR Code...')
      }
      return status
    } catch (error) {
      console.error('Erro ao verificar status:', error)
      notificationService.showError('Erro ao verificar status da instância')
    }
  }

  // Selecionar chat
  const selectChat = async chat => {
    dispatch({ type: appActions.SET_CURRENT_CHAT, payload: chat })

    if (chat && state.currentInstance) {
      // Carregar mensagens do chat
      loadMessages(state.currentInstance.id, chat.id)

      // Marcar como lido se necessário
      if (chat.unreadCount > 0) {
        markChatAsRead(state.currentInstance.id, chat.id)
      }
    }
  }

  // Carregar mensagens
  const loadMessages = async (instanceId, chatId, page = 1) => {
    try {
      dispatch({ type: appActions.SET_MESSAGE_LOADING, payload: true })
      const response = await apiService.getMessages(instanceId, chatId, {
        page,
        limit: 50
      })

      if (page === 1) {
        dispatch({ type: appActions.SET_MESSAGES, payload: response.messages })
      } else {
        dispatch({
          type: appActions.PREPEND_MESSAGES,
          payload: response.messages
        })
      }
    } catch (error) {
      notificationService.showError('Erro ao carregar mensagens')
    } finally {
      dispatch({ type: appActions.SET_MESSAGE_LOADING, payload: false })
    }
  }

  // Marcar chat como lido
  const markChatAsRead = async (instanceId, chatId) => {
    try {
      await apiService.markAsRead(instanceId, chatId)
      dispatch({
        type: appActions.UPDATE_CHAT,
        payload: { id: chatId, data: { unreadCount: 0 } }
      })
    } catch (error) {
      console.error('Erro ao marcar como lido:', error)
    }
  }

  // Atualizar última mensagem do chat
  const updateChatLastMessage = (chatId, message) => {
    // Criar objeto lastMessage no formato esperado pelo Sidebar
    const lastMessage = {
      content: message.content || getMediaDescription(message.messageType),
      type: message.messageType || 'text',
      fromMe: message.fromMe || false,
      timestamp: message.timestamp || new Date().toISOString()
    }

    dispatch({
      type: appActions.UPDATE_CHAT,
      payload: {
        id: chatId,
        data: {
          lastMessage,
          lastMessageTime: message.timestamp,
          unreadCount: message.fromMe
            ? 0
            : state.currentChat?.id === chatId
              ? 0
              : 1
        }
      }
    })
  }

  // Buscar mensagens
  const searchMessages = async query => {
    if (!state.currentInstance || !query.trim()) {
      dispatch({ type: appActions.SET_SEARCH_RESULTS, payload: [] })
      return
    }

    try {
      const response = await apiService.searchMessages(
        state.currentInstance.id,
        { query }
      )
      dispatch({
        type: appActions.SET_SEARCH_RESULTS,
        payload: response.messages
      })
    } catch (error) {
      notificationService.showError('Erro na busca')
    }
  }

  // Toggle sidebar
  const toggleSidebar = () => {
    dispatch({ type: appActions.TOGGLE_SIDEBAR })
  }

  // Toggle dark mode
  const toggleDarkMode = () => {
    dispatch({ type: appActions.TOGGLE_DARK_MODE })
  }

  // Sincronizar chats manualmente
  const syncChatsManual = async (instanceId) => {
    if (!instanceId) return

    // Verificar se já há uma sincronização em andamento para esta instância
    if (syncLockRef.current.has(instanceId)) {
      console.log(`⚠️ Sincronização manual já em andamento para instância ${instanceId}, ignorando nova solicitação`)
      notificationService.showInfo('Sincronização já em andamento')
      return
    }

    // Verificar se a instância está realmente conectada antes de sincronizar
    try {
      const instanceInfo = await apiService.getInstanceStatus(instanceId)
      if (instanceInfo.status !== 'connected') {
        console.log(`⚠️ Instância ${instanceId} não está conectada (status: ${instanceInfo.status}), ignorando sincronização`)
        notificationService.showInfo('A instância precisa estar conectada para sincronizar')
        return
      }
    } catch (error) {
      console.error(`❌ Erro ao verificar status da instância ${instanceId}:`, error)
      notificationService.showError('Erro ao verificar status da instância')
      return
    }

    // Adicionar ao lock global
    syncLockRef.current.add(instanceId)
    console.log(`🔒 Sync lock manual ativado para instância ${instanceId}. Locks ativos:`, Array.from(syncLockRef.current))

    console.log('🔥 syncChatsManual iniciado para instanceId:', instanceId)
    console.log('🎯 Instância atual no contexto:', state.currentInstance?.id)

    // Resetar progresso inicial
    dispatch({
      type: appActions.RESET_SYNC_PROGRESS
    })

    // Iniciar progresso manual no UI imediatamente
    console.log('🚀 Disparando START_SYNC_PROGRESS inicial')
    dispatch({
      type: appActions.START_SYNC_PROGRESS,
      payload: { type: 'manual' }
    })

    // Garantir que está na sala de progresso antes da sincronização
    console.log('📊 Entrando na sala de progresso antes da sincronização')
    if (socketService.isConnected) {
      socketService.joinSyncProgress(instanceId)
      console.log('✅ Entrou na sala de progresso')
      // Aguardar um pouco para garantir que entrou na sala
      await new Promise(resolve => setTimeout(resolve, 200))
    } else {
      console.warn('⚠️ Socket não conectado, tentando reconectar...')
      socketService.connect()
      // Aguardar um pouco para tentar conectar
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (socketService.isConnected) {
        socketService.joinSyncProgress(instanceId)
        console.log('✅ Entrou na sala de progresso (retry)')
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    // Manter compatibilidade com sistema antigo
    dispatch({ type: appActions.SET_SYNCING_CHATS, payload: true })

    try {
      console.log('🔄 Sincronizando chats manualmente...')

      // Iniciar sincronização com a API
      try {
        await apiService.syncChats(instanceId)
        console.log('✅ Sincronização manual concluída')
      } catch (apiError) {
        console.error('❌ Erro ao sincronizar chats:', apiError)

        // Se for timeout mas os eventos de socket continuam chegando, consideramos que está OK
        if (apiError.code === 'ECONNABORTED' && state.syncProgress.progress >= 30) {
          console.log('⚠️ Timeout na API, mas progresso já está em', state.syncProgress.progress + '%', '- continuando o processamento')
          
          // Armazenar a instância em sincronização para uso posterior (caso state.currentInstance seja undefined)
          if (!window.lastSyncInstanceId && instanceId) {
            window.lastSyncInstanceId = instanceId;
            console.log('📌 Armazenando ID da instância em sincronização:', window.lastSyncInstanceId);
          }
          
          // Não tratamos como erro, deixamos o socket continuar atualizando o progresso
          notificationService.showInfo(
            'A sincronização está demorando mais que o normal, mas continua em andamento. Por favor, aguarde.',
            {
              id: 'sync-timeout-info',
              duration: 8000,
              position: 'top-center'
            }
          );
          
          // Retornamos sem lançar o erro
          return;
        } 
        // Tratar erro de rate limit (429)
        else if (apiError.response && apiError.response.status === 429) {
          const retryAfter = apiError.response.data?.retryAfter || 60
          notificationService.showWarning(`Muitas sincronizações em sequência. Aguarde ${retryAfter} segundos antes de tentar novamente.`)

          // Atualizar progresso para mostrar o erro
          dispatch({
            type: appActions.SET_SYNC_PROGRESS,
            payload: {
              isVisible: true,
              status: 'error',
              step: `Limite de sincronizações atingido. Aguarde ${retryAfter} segundos.`,
              progress: 0
            }
          });

          // Tentar novamente automaticamente após o período de espera
          console.log(`⏱️ Agendando nova tentativa em ${retryAfter} segundos`)
          setTimeout(() => {
            console.log('🔄 Tentando sincronização novamente após rate limit')
            syncChatsManual(instanceId)
          }, retryAfter * 1000)

          return
        } else {
          // Outros erros
          notificationService.showError('Erro ao sincronizar: ' + (apiError.message || 'Erro desconhecido'))

          dispatch({
            type: appActions.SET_SYNC_PROGRESS,
            payload: {
              isVisible: true,
              status: 'error',
              step: 'Erro na sincronização: ' + (apiError.message || 'Erro desconhecido'),
              progress: 0
            }
          });
        }

        throw apiError;  // Re-throw para o catch externo
      }

      // Verificar se já recebemos um evento de conclusão do backend
      // Se não recebemos, forçar atualização para 100%
      if (state.syncProgress.progress < 100) {
        console.log('⚠️ Backend não enviou evento de conclusão, atualizando progresso manualmente', 'Timestamp:', new Date().toISOString())
        
        // Forçar atualização do progresso para 100%
        dispatch({
          type: appActions.SET_SYNC_PROGRESS,
          payload: {
            isVisible: true,
            status: 'completed',
            step: 'Sincronização concluída com sucesso!',
            progress: 100
          }
        });
        
        // Após pequeno delay, garantir que o estado de progresso seja completado
        setTimeout(() => {
          console.log('🔄 Verificando se o progresso foi atualizado para 100%')
          if (state.syncProgress.progress < 100) {
            console.log('⚠️ Progresso ainda não está em 100%, forçando conclusão')
            dispatch({
              type: appActions.COMPLETE_SYNC_PROGRESS,
              payload: {
                success: true,
                error: null
              }
            });
          }
        }, 500);
      }
      
      // Mostrar mensagem de sucesso mais detalhada
      notificationService.showSuccess(
        'Suas conversas foram sincronizadas com sucesso! Agora você já pode começar a usar seu WhatsApp.', 
        6000
      );
      
      // Se for a primeira sincronização (sem chats anteriores), mostrar uma mensagem orientativa
      if (!state.chats || state.chats.length === 0) {
        setTimeout(() => {
          notificationService.showInfo(
            '💬 Para iniciar uma nova conversa, clique no botão "+" no canto superior esquerdo.',
            8000
          );
        }, 2000);
      }

      // Resetar o progresso após alguns segundos
      setTimeout(() => {
        dispatch({ type: appActions.RESET_SYNC_PROGRESS })
      }, 3000);

    } catch (error) {
      console.error('❌ Erro na sincronização manual:', error)

      // Verificar se, apesar do erro, o progresso está avançado (o que indica que a sincronização pode estar ocorrendo no backend)
      if (state.syncProgress.progress >= 90) {
        console.log(`⚠️ Erro na API, mas progresso já está em ${state.syncProgress.progress}% - considerando em andamento`)
        
        // Não tratamos como erro, apenas mostramos informação
        notificationService.showInfo(
          'A sincronização continua em andamento no servidor. Por favor, aguarde a conclusão.',
          8000
        );
        
        // Não alteramos o estado de progresso, deixamos o socket continuar atualizando
      } else {
        // Se o progresso não estava avançado, realmente tratamos como erro
        dispatch({
          type: appActions.SET_SYNC_PROGRESS,
          payload: {
            isVisible: true,
            status: 'error',
            step: `Erro: ${error.message}`,
            progress: 0
          }
        });

        setTimeout(() => {
          dispatch({ type: appActions.RESET_SYNC_PROGRESS })
        }, 5000)

        notificationService.showError('Erro ao sincronizar chats')
      }
    } finally {
      // Remover do lock global
      syncLockRef.current.delete(instanceId)
      console.log(`🔓 Sync lock manual removido para instância ${instanceId}. Locks restantes:`, Array.from(syncLockRef.current))

      dispatch({ type: appActions.SET_SYNCING_CHATS, payload: false })
    }
  }

  // Verificar e reconfigurar webhook
  const checkWebhook = async (instanceId) => {
    console.log('🔍 AppContext.checkWebhook chamado com instanceId:', instanceId)
    try {
      const result = await apiService.checkWebhook(instanceId)
      return result
    } catch (error) {
      console.error('Erro ao verificar webhook:', error)
      throw error
    }
  }

  // Mostrar notificação
  const showNotification = (type, message) => {
    if (type === 'success') {
      notificationService.showSuccess(message)
    } else if (type === 'error') {
      notificationService.showError(message)
    } else if (type === 'info') {
      notificationService.showInfo(message)
    } else {
      notificationService.showWarning(message)
    }
  }

  // Função utilitária para descrição de mídia
  const getMediaDescription = type => {
    switch (type) {
      case 'image':
        return '📷 Imagem'
      case 'video':
        return '🎥 Vídeo'
      case 'audio':
        return '🎵 Áudio'
      case 'document':
        return '📄 Documento'
      case 'sticker':
        return '😄 Figurinha'
      case 'location':
        return '📍 Localização'
      default:
        return 'Mensagem'
    }
  }

  // Valor do contexto
  const value = {
    // Estado
    state,

    // Actions
    loadInstances,
    createInstance,
    connectInstance,
    selectInstance,
    loadChats,
    loadChatsLocal,
    loadContacts,
    loadUserProfile,
    selectChat,
    loadMessages,
    markChatAsRead,
    searchMessages,
    toggleSidebar,
    toggleDarkMode,
    syncChatsManual,
    checkWebhook,
    showNotification,
    fetchQRCode,
    recreateInstance,
    checkInstanceStatus,
    disconnectInstance,
    deleteInstance,
    syncInstanceData,

    // Dispatch direto para casos especiais
    dispatch
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// Hook para usar o contexto
export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('useApp deve ser usado dentro de um AppProvider')
  }

  return context
}

export default AppContext