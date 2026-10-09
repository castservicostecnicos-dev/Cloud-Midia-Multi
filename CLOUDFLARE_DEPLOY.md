# 🌐 Guia Completo de Publicação no Cloudflare (Mídia multi CAST)

Este projeto está **100% preparado, configurado e testado** para ser publicado na infraestrutura global da **Cloudflare**.

---

## 🔒 1. Banco de Dados Duplicado e Separado (Firebase Firestore)

Este aplicativo foi configurado com um **banco de dados próprio, duplicado e completamente isolado** do aplicativo original:

- **Documento Separado:** `app_data/indoor_media_db_multicast`
- **Duplicação Automática:** Na primeira inicialização, todos os dados existentes (empresas como VALELAR, operadores, players, playlists, planos e mídias) foram copiados com sucesso para a nova estrutura dedicada.
- **Independência Total:** Nenhuma alteração feita neste aplicativo afeta o banco do aplicativo original clonado, e qualquer alteração no app original não afeta este.
- **Variáveis de Ambiente:**
  - `FIRESTORE_DOC_ID="indoor_media_db_multicast"`
  - `VITE_FIRESTORE_DOC_ID="indoor_media_db_multicast"`

---

## 🚀 Método 1: Cloudflare Pages (Deploy 100% Serverless no Edge)

Este é o método mais rápido, moderno e **gratuito** para hospedar na Cloudflare, aproveitando o motor cliente direto no Firestore e suporte a PWA Offline.

### Passo a Passo:
1. Envie este repositório para o seu **GitHub** ou **GitLab**.
2. Acesse o painel da [Cloudflare](https://dash.cloudflare.com/).
3. No menu lateral, vá em **Workers & Pages** &rarr; clique em **Create application** &rarr; aba **Pages** &rarr; **Connect to Git**.
4. Selecione o repositório deste projeto.
5. Em **Set up builds and deployments**, preencha exatamente:
   - **Project name:** `midia-multi-cast` (ou o nome que preferir)
   - **Production branch:** `main` (ou a sua branch ativa)
   - **Framework preset:** `Vite` (ou `None`)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** *(deixe em branco)*
6. Na seção **Environment variables (advanced)**, adicione:
   - `NODE_VERSION` = `20`
   - `VITE_FIRESTORE_DOC_ID` = `indoor_media_db_multicast`
7. Clique em **Save and Deploy**.
8. Em cerca de 1 minuto, a Cloudflare gerará a sua URL pública:
   `https://midia-multi-cast.pages.dev`

> **Nota sobre o Roteamento SPA:** O repositório já inclui o arquivo `public/_redirects` com a regra `/* /index.html 200`. Isso garante que ao atualizar páginas como `/admin`, `/player` ou `/company`, a Cloudflare não exibirá erro 404.

---

## ⚡ Método 2: Cloudflare Tunnel (cloudflared) — Idêntico ao Render

Se você deseja rodar exatamente o servidor Node.js/Express completo (`server.ts`) com SSE (Server-Sent Events) contínuo e chamadas em tempo real idêntico ao Render, o **Cloudflare Tunnel** é a melhor solução. Ele permite rodar o container Docker ou processo Node.js em qualquer máquina/VPS com **0 portas abertas** para a internet:

1. Instale o utilitário da Cloudflare no servidor ou máquina local:
   ```bash
   # Linux / Ubuntu
   sudo apt install -y cloudflared
   ```
2. Faça login na sua conta Cloudflare:
   ```bash
   cloudflared tunnel login
   ```
3. Crie o túnel seguro:
   ```bash
   cloudflared tunnel create midia-cast-tunnel
   ```
4. Aponte o túnel para a porta local da aplicação (`3000`):
   ```bash
   cloudflared tunnel route dns midia-cast-tunnel tv.seudominio.com.br
   cloudflared tunnel run --url http://localhost:3000 midia-cast-tunnel
   ```
5. Pronto! Seu app estará acessível em `https://tv.seudominio.com.br` com SSL gratuito da Cloudflare, proteção DDoS, WebSocket e SSE liberados sem expor o IP do servidor!

---

## 🔄 Método 3: Arquitetura Híbrida (Frontend no Cloudflare Pages + API no Render/Docker)

Você também pode utilizar o Cloudflare Pages para servir o Frontend ultra-rápido no Edge global da Cloudflare e conectar ao seu backend Node.js:

1. No painel do Cloudflare Pages, vá em **Settings** &rarr; **Environment variables**.
2. Adicione a variável de ambiente:
   - `VITE_API_BASE_URL` = `https://seu-backend-no-render.onrender.com/api`
   - *(ou defina `BACKEND_URL` para que o proxy do Cloudflare Pages Functions em `functions/api/[[path]].ts` encaminhe automaticamente as requisições)*
3. Clique em **Save** e faça um novo deploy (Retry deployment).

---

## 🛠️ Método 4: Deploy via Wrangler CLI (Linha de Comando)

Se você utiliza o terminal com a CLI oficial da Cloudflare (`wrangler`), você pode compilar e enviar em um único comando:

1. No diretório do projeto:
   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name midia-multi-cast
   ```
2. O arquivo `wrangler.jsonc` já está configurado na raiz com a pasta de saída `dist` e compatibilidade Node.js.

---

## 🌐 5. Configuração de Domínio Personalizado na Cloudflare

Para usar seu próprio domínio (ex.: `painel.suaempresa.com.br` ou `tv.suaempresa.com.br`):

1. No painel do Cloudflare Pages, acesse o seu projeto.
2. Clique na aba **Custom domains** &rarr; **Set up a custom domain**.
3. Digite o seu domínio ou subdomínio (ex: `tv.suaempresa.com.br`).
4. A Cloudflare criará automaticamente os registros DNS tipo CNAME apontando para o seu projeto com proxy ativado (nuvem laranja) e certificado SSL/TLS automático!

---

## 🔑 6. Autorização do Domínio no Firebase e Google Cloud

Para que o login Google e a sincronização do Google Drive funcionem no novo domínio:

### 1. No Firebase Console:
1. Acesse o [Firebase Console](https://console.firebase.google.com/) no projeto `deep-freedom-8szp9` (ou seu projeto customizado).
2. Vá em **Authentication** &rarr; aba **Settings** &rarr; **Authorized domains**.
3. Clique em **Add domain** e adicione:
   - `midia-multi-cast.pages.dev` (ou a URL do seu projeto Pages)
   - `seu-dominio-personalizado.com.br` (se for usar domínio próprio)

### 2. No Google Cloud Console (Google Drive):
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) &rarr; **APIs e Serviços** &rarr; **Credenciais**.
2. No seu **ID do cliente OAuth 2.0 (Web)**:
   - Em **Origens JavaScript autorizadas**, adicione a URL da Cloudflare (ex: `https://midia-multi-cast.pages.dev`).
   - Em **URIs de redirecionamento autorizados**, adicione a URL da Cloudflare e clique em **Salvar**.

---

## 📋 Resumo das Configurações Prontas no Repositório

| Arquivo | Função no Cloudflare |
| :--- | :--- |
| `public/_redirects` | Evita erros 404 em navegações diretas nas rotas SPA (`/admin`, `/player`, etc.) |
| `public/_headers` | Configura cache imutável para assets Vite e cache seguro para PWA Service Worker |
| `wrangler.jsonc` | Configuração oficial para deploy direto com a CLI `wrangler` |
| `functions/api/[[path]].ts` | Edge Function do Cloudflare Pages para proxy de API ou resposta direta |
| `src/lib/clientFirestoreFallback.ts` | Motor de fallback cliente que conversa diretamente com o Firestore duplicado |
| `server/firestore.ts` | Backend sincronizado com o documento isolado `indoor_media_db_multicast` |
