# SucataPro Backend

Backend completo para a plataforma SucataPro - Sistema de gestão de oportunidades de compra de sucata.

## Funcionalidades

- ✅ **Autenticação JWT** segura com bcrypt
- ✅ **Envio de emails** para recuperação de senha e códigos de primeiro acesso
- ✅ **Restrição de domínio** (@sucalog.com.br) para segurança
- ✅ **API RESTful** completa para todas as funcionalidades
- ✅ **Banco de dados PostgreSQL** com Prisma ORM
- ✅ **Rate limiting** e proteção contra ataques
- ✅ **Logs** detalhados de atividades

## Tecnologias

- **Node.js** + **Express** + **TypeScript**
- **PostgreSQL** + **Prisma ORM**
- **JWT** para autenticação
- **Bcrypt** para hash de senhas
- **SendGrid** para envio de emails
- **Helmet** + **CORS** para segurança

## Requisitos

- Node.js 18+
- PostgreSQL 14+
- Conta SendGrid (para envio de emails)

## Instalação Local

### 1. Clone o repositório

```bash
cd sucatapro-backend
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

### 4. Configure o banco de dados

```bash
# Gere o cliente Prisma
npx prisma generate

# Execute as migrações
npx prisma migrate dev --name init

# (Opcional) Popule com dados de exemplo
npx prisma db seed
```

### 5. Inicie o servidor

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

O servidor estará rodando em `http://localhost:3001`

## Configuração de Email (SendGrid)

### 1. Crie uma conta no SendGrid

Acesse: https://sendgrid.com

Plano gratuito: **100 emails/dia**

### 2. Gere uma API Key

1. Vá em **Settings** > **API Keys**
2. Clique em **Create API Key**
3. Nome: `SucataPro`
4. Permissões: **Full Access** ou restrito para **Mail Send**
5. Copie a chave gerada

### 3. Verifique seu domínio (obrigatório)

1. Vá em **Settings** > **Sender Authentication**
2. Clique em **Authenticate Your Domain**
3. Siga as instruções para adicionar os registros DNS
4. Aguarde a verificação (pode levar até 48h)

### 4. Configure o .env

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.sua_api_key_aqui
EMAIL_FROM=noreply@sucalog.com.br
EMAIL_FROM_NAME=SucataPro
```

## Deploy em Produção

### Opção 1: Railway (Recomendado - Mais fácil)

1. Crie conta em https://railway.app
2. Clique em **New Project** > **Deploy from GitHub repo**
3. Conecte seu repositório
4. Adicione um banco PostgreSQL: **New** > **Database** > **Add PostgreSQL**
5. Configure as variáveis de ambiente em **Variables**
6. O Railway gera automaticamente a `DATABASE_URL`

**Preço:** Gratuito até $5/mês (500h de uso)

### Opção 2: Render

1. Crie conta em https://render.com
2. Clique em **New** > **Web Service**
3. Conecte seu repositório
4. Configure:
   - **Build Command:** `npm install && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm start`
5. Adicione um PostgreSQL em **New** > **PostgreSQL**
6. Configure as variáveis de ambiente

**Preço:** Gratuito (dorme após 15min de inatividade)

### Opção 3: AWS (EC2 + RDS)

#### Banco de dados (RDS)

1. Acesse https://aws.amazon.com/rds
2. Crie uma instância PostgreSQL
3. Tipo: `db.t3.micro` (gratuito por 12 meses)
4. Anote o endpoint, usuário e senha

#### Servidor (EC2)

1. Acesse https://aws.amazon.com/ec2
2. Lançar instância Ubuntu 22.04
3. Tipo: `t2.micro` (gratuito por 12 meses)
4. Configure Security Group para porta 3001
5. Conecte via SSH e instale:

```bash
# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2
sudo npm install -g pm2

# Clonar e configurar
git clone <seu-repo>
cd sucatapro-backend
npm install
npm run build

# Configurar variáveis de ambiente
nano .env

# Executar migrações
npx prisma migrate deploy

# Iniciar com PM2
pm2 start dist/server.js --name sucatapro-api
pm2 startup
pm2 save
```

**Preço:** Gratuito por 12 meses, depois ~$15-20/mês

### Opção 4: VPS (DigitalOcean, Linode, etc)

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PostgreSQL
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Configurar PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE sucatapro;"
sudo -u postgres psql -c "CREATE USER sucatapro WITH PASSWORD 'sua_senha_segura';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sucatapro TO sucatapro;"

# Instalar PM2
sudo npm install -g pm2

# Clonar projeto
git clone <seu-repo>
cd sucatapro-backend
npm install
npm run build

# Configurar .env
nano .env

# Migrações
npx prisma migrate deploy
npx prisma db seed

# Iniciar
pm2 start dist/server.js --name sucatapro-api
pm2 startup
pm2 save

# Configurar Nginx (opcional, para HTTPS)
sudo apt install nginx -y
```

## Variáveis de Ambiente

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `NODE_ENV` | Ambiente (development/production) | Sim |
| `PORT` | Porta do servidor | Não (padrão: 3001) |
| `FRONTEND_URL` | URL do frontend (CORS) | Sim |
| `DATABASE_URL` | URL do PostgreSQL | Sim |
| `JWT_SECRET` | Chave secreta JWT | Sim |
| `JWT_EXPIRES_IN` | Expiração do token | Não (padrão: 7d) |
| `EMAIL_PROVIDER` | Provedor (sendgrid/smtp) | Sim |
| `SENDGRID_API_KEY` | API Key do SendGrid | Se usar SendGrid |
| `EMAIL_FROM` | Email de envio | Sim |
| `EMAIL_FROM_NAME` | Nome do remetente | Sim |

## API Endpoints

### Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro com código de acesso
- `POST /api/auth/forgot-password` - Solicitar recuperação de senha
- `POST /api/auth/reset-password` - Redefinir senha
- `GET /api/auth/me` - Dados do usuário logado

### Usuários
- `GET /api/users` - Listar usuários
- `GET /api/users/:id` - Detalhes do usuário
- `POST /api/users` - Criar usuário
- `PUT /api/users/:id` - Atualizar usuário
- `DELETE /api/users/:id` - Excluir usuário

### Oportunidades
- `GET /api/opportunities` - Listar oportunidades
- `GET /api/opportunities/:id` - Detalhes da oportunidade
- `POST /api/opportunities` - Criar oportunidade
- `PUT /api/opportunities/:id` - Atualizar oportunidade
- `PATCH /api/opportunities/:id/status` - Atualizar status
- `POST /api/opportunities/:id/transfer` - Transferir oportunidade
- `DELETE /api/opportunities/:id` - Excluir oportunidade

### Aprovações
- `GET /api/approvals` - Listar aprovações
- `GET /api/approvals/pending` - Aprovações pendentes
- `POST /api/approvals` - Solicitar aprovação
- `POST /api/approvals/:id/respond` - Responder aprovação

### Dashboard
- `GET /api/dashboard/metrics` - Métricas do dashboard
- `GET /api/dashboard/pipeline` - Dados do pipeline
- `GET /api/dashboard/team-performance` - Desempenho da equipe
- `GET /api/dashboard/trends` - Tendências mensais

### Códigos de Acesso
- `GET /api/access-codes` - Listar códigos
- `POST /api/access-codes` - Gerar novo código
- `POST /api/access-codes/:id/resend` - Reenviar email
- `PATCH /api/access-codes/:id/cancel` - Cancelar código

### Candidaturas (Landing Page)
- `POST /api/applications/submit` - Enviar candidatura (público)
- `GET /api/applications` - Listar candidaturas
- `PATCH /api/applications/:id/status` - Atualizar status

## Estrutura do Projeto

```
sucatapro-backend/
├── prisma/
│   ├── schema.prisma      # Schema do banco de dados
│   └── seed.ts            # Dados iniciais
├── src/
│   ├── middleware/
│   │   └── auth.ts        # Middleware de autenticação
│   ├── routes/
│   │   ├── auth.ts        # Rotas de autenticação
│   │   ├── users.ts       # Rotas de usuários
│   │   ├── opportunities.ts
│   │   ├── approvals.ts
│   │   ├── activities.ts
│   │   ├── sources.ts
│   │   ├── accessCodes.ts
│   │   ├── applications.ts
│   │   ├── dashboard.ts
│   │   └── reports.ts
│   ├── utils/
│   │   ├── auth.ts        # Funções de autenticação
│   │   └── email.ts       # Funções de email
│   └── server.ts          # Servidor Express
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Comandos Úteis

```bash
# Desenvolvimento
npm run dev              # Inicia em modo desenvolvimento

# Build
npm run build            # Compila TypeScript
npm start                # Inicia em produção

# Banco de dados
npx prisma migrate dev   # Cria migração
npx prisma migrate deploy # Aplica migrações em produção
npx prisma db seed       # Executa seed
npx prisma studio        # Interface visual do banco

# Testes
npm run lint             # Verifica código
```

## Suporte

Para dúvidas ou problemas, entre em contato com a equipe de desenvolvimento.

---

**SucataPro** - Gestão inteligente de oportunidades de sucata
