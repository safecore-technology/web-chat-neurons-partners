#!/bin/bash

echo "🚀 Iniciando setup completo do WhatsApp Web..."
echo ""

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado. Por favor, instale Node.js 18+ primeiro."
    exit 1
fi

echo "✅ Node.js encontrado: $(node --version)"

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não está instalado."
    exit 1
fi

echo "✅ npm encontrado: $(npm --version)"
echo ""

# Instalar dependências do projeto raiz
echo "📦 Instalando dependências do projeto raiz..."
npm install

# Instalar dependências do backend
echo "📦 Instalando dependências do backend..."
cd backend
npm install
echo "✅ Dependências do backend instaladas"

# Executar setup do backend
echo "⚙️ Configurando backend..."
node setup.js

cd ..

# Verificar se frontend foi criado
if [ ! -d "frontend" ]; then
    echo "📱 Criando aplicação React para o frontend..."
    npx create-react-app frontend
fi

# Instalar dependências adicionais do frontend
echo "📦 Instalando dependências adicionais do frontend..."
cd frontend
npm install axios socket.io-client react-router-dom @heroicons/react react-toastify react-hot-toast tailwindcss @tailwindcss/forms @headlessui/react clsx

echo "✅ Dependências do frontend instaladas"
cd ..

echo ""
echo "🎉 Setup completo concluído!"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure o arquivo backend/.env com suas configurações"
echo "2. Inicie a Evolution API (Docker recomendado)"
echo "3. Execute 'npm run dev' para iniciar ambos os serviços"
echo ""
echo "📖 Para mais informações, consulte o README.md"
