import React, { useState, useEffect } from 'react'
import { apiClient } from '../config/supabase'
import ChatArea from '../components/chat/ChatArea'
import Sidebar from '../components/chat/Sidebar'
import Loading from '../components/common/Loading'

const IframeApp = () => {
  const [instances, setInstances] = useState([])
  const [selectedInstance, setSelectedInstance] = useState(null)
  const [selectedChat, setSelectedChat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadInstances()
  }, [])

  const loadInstances = async () => {
    try {
      setLoading(true)
      const data = await apiClient.get('/api/instances')
      setInstances(data.instances || [])
      
      // Auto-selecionar primeira instância conectada
      const connectedInstance = data.instances?.find(i => i.status === 'connected')
      if (connectedInstance) {
        setSelectedInstance(connectedInstance)
      }
    } catch (err) {
      console.error('Erro ao carregar instâncias:', err)
      setError('Falha ao carregar instâncias do WhatsApp')
    } finally {
      setLoading(false)
    }
  }

  const handleInstanceSelect = (instance) => {
    setSelectedInstance(instance)
    setSelectedChat(null) // Reset selected chat when changing instance
  }

  const handleChatSelect = (chat) => {
    setSelectedChat(chat)
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loading message="Carregando WhatsApp Web..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="text-red-500 text-xl mb-4">⚠️ Erro de Conexão</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadInstances}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    )
  }

  if (!instances.length) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="text-gray-500 text-xl mb-4">📱 Nenhuma Instância</div>
          <p className="text-gray-600">
            Nenhuma instância do WhatsApp foi encontrada. 
            Entre em contato com o administrador.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Header com seleção de instância (se múltiplas) */}
      {instances.length > 1 && (
        <div className="absolute top-0 left-0 right-0 bg-white border-b border-gray-200 z-10 p-2">
          <select
            value={selectedInstance?.id || ''}
            onChange={(e) => {
              const instance = instances.find(i => i.id === e.target.value)
              if (instance) handleInstanceSelect(instance)
            }}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecione uma instância</option>
            {instances.map(instance => (
              <option key={instance.id} value={instance.id}>
                {instance.name} - {instance.status === 'connected' ? '🟢 Conectado' : '🔴 Desconectado'}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={`flex w-full ${instances.length > 1 ? 'mt-16' : ''}`}>
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {selectedInstance ? (
            <Sidebar
              instanceId={selectedInstance.id}
              selectedChat={selectedChat}
              onChatSelect={handleChatSelect}
              isIframe={true}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500">Selecione uma instância</p>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedInstance && selectedChat ? (
            <ChatArea
              instanceId={selectedInstance.id}
              chat={selectedChat}
              isIframe={true}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="text-6xl mb-4">💬</div>
                <h2 className="text-xl font-semibold text-gray-700 mb-2">
                  WhatsApp Web
                </h2>
                <p className="text-gray-500">
                  {!selectedInstance 
                    ? 'Selecione uma instância para começar'
                    : 'Selecione uma conversa para começar a enviar mensagens'
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default IframeApp