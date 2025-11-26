#!/bin/bash

echo "🚀 Iniciando iFood Admin UI..."

# Instalar dependências se não existirem
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Verificar se a admin-api está rodando
echo "🔍 Verificando se a admin-api está rodando..."
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Admin API está rodando"
else
    echo "❌ Admin API não está rodando!"
    echo "   Por favor, execute primeiro:"
    echo "   cd ../admin-api && npm install && npm run dev"
    exit 1
fi

echo "🌐 Iniciando interface React..."
npm start