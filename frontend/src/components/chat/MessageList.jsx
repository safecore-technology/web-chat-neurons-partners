import React, { useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import Loading from '../common/Loading';

const MessageList = () => {
  const { state } = useApp();
  const { currentChat, messages, messageLoading } = state;

  // Log para debug
  useEffect(() => {
    if (currentChat) {
      console.log('🔍 MessageList - Chat atual:', {
        id: currentChat.id,
        name: currentChat.name,
        phone: currentChat.phone,
        messagesCount: messages.length
      });
    }
  }, [currentChat, messages]);

  if (messageLoading) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <Loading text="Carregando mensagens..." />
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

  if (messages.length === 0) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center" style={{ paddingTop: '50px', paddingBottom: '50px' }}>
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
    <div className="flex-1 bg-gray-50 overflow-y-auto p-4">
      <div className="space-y-4">
        {messages.map((message, index) => (
          <div key={message.id || index} className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
              message.fromMe 
                ? 'bg-green-500 text-white' 
                : 'bg-white text-gray-900 border'
            }`}>
              <p className="text-sm">{message.content || 'Mensagem sem conteúdo'}</p>
              <p className="text-xs mt-1 opacity-75">
                {new Date(message.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MessageList;
