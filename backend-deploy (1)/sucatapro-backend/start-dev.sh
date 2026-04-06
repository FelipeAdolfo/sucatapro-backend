#!/bin/bash

echo "🚀 Iniciando SucataPro Backend em modo desenvolvimento..."

# Verificar se o .env existe
if [ ! -f .env ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    echo "📝 Copiando .env.example para .env..."
    cp .env.example .env
    echo "✅ .env criado. Por favor, edite-o com suas configurações antes de continuar."
    exit 1
fi

# Verificar se as dependências estão instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Gerar cliente Prisma
echo "🔧 Gerando cliente Prisma..."
npx prisma generate

# Verificar se o banco está configurado
if ! npx prisma migrate status > /dev/null 2>&1; then
    echo "🗄️  Executando migrações..."
    npx prisma migrate dev --name init
fi

echo "✅ Tudo pronto!"
echo "🌐 Iniciando servidor..."
echo ""

npm run dev
