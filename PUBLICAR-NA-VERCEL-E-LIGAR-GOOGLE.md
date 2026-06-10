# Publicar na Vercel e ligar Google

## 1. Variáveis locais
Crie `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=COLE_A_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=COLE_A_PUBLISHABLE_KEY
TMDB_READ_ACCESS_TOKEN=COLE_O_TOKEN_DO_TMDB
```

## 2. Teste local
```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## 3. Supabase
- Rode `supabase/schema.sql`
- Em **Authentication → URL Configuration**, defina:
  - `Site URL`: `http://localhost:3000`
  - `Redirect URLs`: `http://localhost:3000`
- Em **Authentication → Sign In / Providers → Google**, ative Google e cole o Client ID e Client Secret do Google Cloud

## 4. Google Cloud
- Crie a tela de consentimento OAuth
- Crie um **OAuth Client ID** do tipo **Aplicativo da Web**
- Em **Authorized redirect URIs**, cole o callback URL mostrado pelo Supabase

## 5. Vercel
- Importe o repositório
- Adicione as mesmas 3 variáveis de ambiente
- Faça o deploy
- Depois atualize no Supabase:
  - `Site URL`: `https://SEU-PROJETO.vercel.app`
  - `Redirect URLs`: `https://SEU-PROJETO.vercel.app`

## Observação
O app publicado lê a configuração do Supabase via `/api/config`.
