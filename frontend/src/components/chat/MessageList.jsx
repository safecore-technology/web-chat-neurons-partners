import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import Loading from '../common/Loading';

const MessageList = () => {
  const { state, loadMessages } = useApp();
  const { currentChat, messages, messageLoading } = state;
  
  // States para scroll infinito
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  
  // Refs
  const scrollRef = useRef(null);
  const isLoadingRef = useRef(false);

  // Função para carregar mensagens mais antigas - DEVE estar antes dos returns
  const loadOlderMessages = useCallback(async () => {
    if (!currentChat || !hasMore || isLoadingRef.current || messageLoading) {
      return;
    }

    // console.log('📜 Carregando mensagens mais antigas - página:', currentPage + 1);
    
    isLoadingRef.current = true;
    setLoadingOlder(true);

    try {
      const nextPage = currentPage + 1;
      
      // Salvar posição atual do scroll com mais precisão
      const scrollElement = scrollRef.current;
      const scrollTopBefore = scrollElement?.scrollTop || 0;
      const scrollHeightBefore = scrollElement?.scrollHeight || 0;
      
      // Usar sempre o phone do currentChat atual para garantir consistência
      const chatIdentifier = currentChat.phone || currentChat.chatId || currentChat.id;
      const response = await loadMessages(state.currentInstance.id, chatIdentifier, nextPage);
      
      // Se a resposta tem paginação, usar hasMore da resposta
      if (response && response.pagination) {
        setHasMore(response.pagination.hasMore);
      } else {
        // Fallback: se retornou menos que 50 mensagens, provavelmente não há mais
        const hasMoreMessages = response && response.messages && response.messages.length === 50;
        setHasMore(hasMoreMessages);
      }
      
      setCurrentPage(nextPage);
      
      // Usar dois requestAnimationFrame para garantir que o layout foi calculado
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollElement) {
            const scrollHeightAfter = scrollElement.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            
            // Calcular nova posição do scroll para manter a mesma visualização
            const newScrollTop = scrollTopBefore + heightDifference;
            
            // Aplicar a nova posição com suavidade
            scrollElement.scrollTo({
              top: newScrollTop,
              behavior: 'auto' // Instantâneo para não causar flicker
            });
          }
        });
      });
      
    } catch (error) {
      console.error('❌ Erro ao carregar mensagens antigas:', error);
      setHasMore(false);
    } finally {
      setLoadingOlder(false);
      isLoadingRef.current = false;
    }
  }, [currentChat, hasMore, currentPage, messageLoading, loadMessages, state.currentInstance]);

  // Event handler para scroll - DEVE estar antes dos returns
  const handleScroll = useCallback((e) => {
    const element = e.target;
    
    // Se scrollou até o topo (ou quase), carregar mais mensagens
    if (element.scrollTop <= 100 && hasMore && !loadingOlder) {
      loadOlderMessages();
    }
  }, [hasMore, loadingOlder, loadOlderMessages]);

  // Log para debug - remover em produção
  // useEffect(() => {
  //   if (currentChat) {
  //     console.log('🔍 MessageList - Chat atual:', {
  //       id: currentChat.id,
  //       name: currentChat.name,
  //       phone: currentChat.phone,
  //       messagesCount: messages.length,
  //       currentPage,
  //       hasMore
  //     });
  //   }
  // }, [currentChat, messages, currentPage, hasMore]);

  // Reset paginação quando muda de chat
  useEffect(() => {
    if (currentChat) {
      setCurrentPage(1);
      setHasMore(true);
      setLoadingOlder(false);
      isLoadingRef.current = false;
    }
  }, [currentChat?.id]);

  // Scroll para o final quando as mensagens carregam pela primeira vez ou quando novas mensagens chegam
  useEffect(() => {
    if (messages.length > 0 && scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          // Verificar se já estamos perto do final para não interromper a leitura
          const scrollElement = scrollRef.current;
          const isNearBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 300;
          
          // Se estamos na primeira página, sempre rolar para o final
          // OU se estamos perto do final, rolar para o final quando novas mensagens chegam
          if (currentPage === 1 || isNearBottom) {
            console.log('📜 Rolando para o final da conversa - novas mensagens ou primeira carga')
            scrollElement.scrollTop = scrollElement.scrollHeight;
          }
        }
      }, 100);
    }
  }, [messages.length, currentPage]);

  if (messageLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <Loading text="Carregando mensagens..." className="scale-125" />
      </div>
    );
  }

  if (!currentChat) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-lg font-medium">Selecione uma conversa</p>
          <p className="text-sm">Para começar a conversar, selecione um chat</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0 && !messageLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <div className="text-center text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-2-2V10a2 2 0 012-2h2m2-4h6a2 2 0 012 2v6a2 2 0 01-2 2h-6m0-8V4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h2" />
          </svg>
          <p className="text-lg font-medium">Nenhuma mensagem ainda</p>
          <p className="text-sm">Seja o primeiro a enviar uma mensagem para {currentChat.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      className="h-full bg-gray-50 overflow-y-auto p-4" 
      onScroll={handleScroll}
      style={{ 
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0 // Importante para flex containers
      }}
    >
      {/* Indicador de carregamento de mensagens antigas */}
      {loadingOlder && (
        <div className="flex justify-center py-4">
          <div className="flex items-center space-x-2 text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
            <span className="text-sm">Carregando mensagens antigas...</span>
          </div>
        </div>
      )}
      
      {/* Indicador se não há mais mensagens */}
      {!hasMore && messages.length > 0 && (
        <div className="flex justify-center py-4">
          <div className="text-xs text-gray-400 bg-gray-200 px-3 py-1 rounded-full">
            Início da conversa
          </div>
        </div>
      )}

      <div className="space-y-4 flex-1" style={{ minHeight: 'fit-content' }}>
        {messages.map((message, index) => (
          <div key={message.id || `msg-${index}`} className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
              message.fromMe 
                ? 'bg-green-500 text-white' 
                : 'bg-white text-gray-900 border'
            }`}>
              {message.source === 'webhook' && (
                <div className="text-xs mb-1 font-light text-gray-100">
                  {message.fromMe ? 'Você' : message.pushName || 'Contato'}
                </div>
              )}
              <p className="text-sm">{message.content || 'Mensagem sem conteúdo'}</p>
              <p className="text-xs mt-1 opacity-75">
                {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : 'Agora'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MessageList;
