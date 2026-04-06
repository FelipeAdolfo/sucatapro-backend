# Guia de Deploy - SucataPro Backend

Este guia contém instruções passo a passo para colocar o backend em produção.

## 📋 Resumo dos Serviços Necessários

| Serviço | Provedor Recomendado | Custo |
|---------|---------------------|-------|
| **Banco de Dados** | Railway PostgreSQL | Gratuito ($5 crédito/mês) |
| **API/Backend** | Railway | Gratuito ($5 crédito/mês) |
| **Envio de Email** | SendGrid | Gratuito (100 emails/dia) |
| **Frontend** | Vercel/Netlify | Gratuito |

**Custo Total: GRATUITO** (para uso inicial)

---

## 1️⃣ Banco de Dados PostgreSQL

### Opção A: Railway (Recomendado - Mais Fácil)

1. Acesse https://railway.app e crie uma conta (pode usar GitHub)
2. Clique em **"New Project"**
3. Clique em **"New"** > **"Database"** > **"Add PostgreSQL"**
4. Aguarde a criação (alguns segundos)
5. Clique no banco criado
6. Vá em **"Variables"** e copie a `DATABASE_URL`

### Opção B: Supabase (Alternativa)

1. Acesse https://supabase.com e crie conta
2. Crie novo projeto
3. Em **Project Settings** > **Database** > **Connection String** > **URI**
4. Copie a connection string

---

## 2️⃣ Conta SendGrid (Envio de Emails)

### Criar Conta

1. Acesse https://signup.sendgrid.com
2. Crie conta com email da SucataLog
3. Verifique seu email

### Verificar Domínio (IMPORTANTE)

1. No dashboard SendGrid, vá em **Settings** > **Sender Authentication**
2. Clique em **"Authenticate Your Domain"**
3. Escolha **"Other Host"** (não é AWS, Azure, etc)
4. Digite: `sucalog.com.br`
5. Siga as instruções para adicionar registros DNS no seu provedor de domínio:

```
# Registros CNAME a serem adicionados no DNS:
Type: CNAME
Name: [fornecido pelo SendGrid]
Value: [fornecido pelo SendGrid]
```

6. Aguarde verificação (pode levar de minutos a 48h)

### Criar API Key

1. Vá em **Settings** > **API Keys**
2. Clique **"Create API Key"**
3. Nome: `SucataPro Production`
4. Permissões: **Full Access**
5. Copie a chave (só aparece uma vez!)

---

## 3️⃣ Deploy do Backend

### Opção A: Railway (Recomendado)

#### Preparar o Código

1. Crie um repositório no GitHub com o código do backend
2. Faça push de todo o código:

```bash
cd sucatapro-backend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/sucatapro-backend.git
git push -u origin main
```

#### Deploy

1. No Railway, clique em **"New Project"**
2. Selecione **"Deploy from GitHub repo"**
3. Conecte sua conta GitHub e escolha o repositório
4. Clique em **"Add Variables"** e adicione:

```
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://sucalog.com.br  # ou URL do seu frontend
DATABASE_URL=[cole a URL do Railway PostgreSQL]
JWT_SECRET=[gere uma chave segura: openssl rand -base64 32]
JWT_EXPIRES_IN=7d
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=[cole sua API Key do SendGrid]
EMAIL_FROM=noreply@sucalog.com.br
EMAIL_FROM_NAME=SucataPro
```

5. Clique em **"Deploy"**
6. Aguarde o deploy (2-3 minutos)
7. Copie a URL gerada (ex: `https://sucatapro-api.up.railway.app`)

---

### Opção B: Render

1. Acesse https://render.com e crie conta
2. Clique **"New"** > **"Web Service"**
3. Conecte seu repositório GitHub
4. Configure:
   - **Name:** sucatapro-api
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm start`
5. Clique **"Advanced"** e adicione as mesmas variáveis de ambiente acima
6. Clique **"Create Web Service"**

---

## 4️⃣ Configurar o Frontend

Depois de fazer o deploy do backend, atualize o frontend para usar a nova API:

1. No código do frontend, localize onde está configurada a URL da API
2. Atualize para a URL do seu backend deployado:

```typescript
// src/config/api.ts ou similar
export const API_URL = 'https://sucatapro-api.up.railway.app/api';
```

3. Faça deploy do frontend atualizado

---

## 5️⃣ Testar o Sistema

### Testar Envio de Email

1. Acesse a landing page de primeiro acesso
2. Como administrador, gere um código para: `teste@sucalog.com.br`
3. Verifique se o email chegou

### Testar Recuperação de Senha

1. Na tela de login, clique "Esqueci minha senha"
2. Digite: `felipe@sucalog.com.br`
3. Verifique se o email com código chegou

---

## 🔧 Troubleshooting

### Emails não estão sendo enviados

1. Verifique se o domínio está verificado no SendGrid
2. Confira se a API Key está correta nas variáveis
3. Veja os logs no Railway/Render: **Deployments** > **Logs**

### Banco de dados não conecta

1. Verifique se a `DATABASE_URL` está correta
2. Certifique-se de que a migration foi aplicada:
   ```bash
   npx prisma migrate deploy
   ```

### CORS errors no frontend

1. Verifique se `FRONTEND_URL` está configurado corretamente
2. Inclua `https://` na URL

---

## 📊 Monitoramento

### Logs

- **Railway:** Dashboard > Deployments > Logs
- **Render:** Dashboard > Service > Logs

### Métricas

- **Railway:** Dashboard > Metrics (uso de CPU, memória)
- **SendGrid:** Dashboard > Statistics (emails enviados)

---

## 💰 Custos Estimados

### Uso Inicial (Gratuito)

| Serviço | Plano | Limite |
|---------|-------|--------|
| Railway | Starter | $5/mês |
| SendGrid | Free | 100 emails/dia |
| Total | - | **GRATUITO** |

### Quando Crescer

| Serviço | Plano | Custo |
|---------|-------|-------|
| Railway | Pro | $5/mês |
| SendGrid | Essentials | $19.95/mês (50k emails) |
| Total | - | **~$25/mês** |

---

## 🆘 Suporte

Se precisar de ajuda:

1. **Railway:** https://railway.app/help
2. **SendGrid:** https://support.sendgrid.com
3. **Prisma:** https://www.prisma.io/docs

---

## ✅ Checklist Final

- [ ] Banco PostgreSQL criado
- [ ] SendGrid configurado e domínio verificado
- [ ] Backend deployado
- [ ] Variáveis de ambiente configuradas
- [ ] Frontend apontando para API correta
- [ ] Teste de envio de email realizado
- [ ] Teste de recuperação de senha realizado
- [ ] Código de primeiro acesso testado

---

**Pronto!** Seu backend SucataPro está em produção! 🚀
