import React from 'react';
import { useApp } from '../../contexts/AppContext';

const MessageList = () => {
  const { state } = useApp();

  // Componente temporário - será implementado completamente depois
  return (
    <div className="flex-1 bg-gray-50 flex items-center justify-center">
      <div className="text-center text-gray-500">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-lg font-medium">Lista de mensagens</p>
        <p className="text-sm">As mensagens aparecerão aqui</p>
      </div>
    </div>
  );
};

export default MessageList;
