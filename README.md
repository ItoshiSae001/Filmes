# ListFli8x

Site de lista de filmes com:
- login com Google
- lista pessoal automática
- listas compartilhadas opcionais
- busca automática de dados do filme
- marcar assistido
- dar nota
- editar detalhes
- remover filme

## Rodar localmente

Crie um arquivo `.env.local` na raiz do projeto:

```env
NEXT_PUBLIC_SUPABASE_URL=COLE_A_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=COLE_A_PUBLISHABLE_KEY
TMDB_READ_ACCESS_TOKEN=COLE_O_TOKEN_DO_TMDB
```

Depois rode:

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## Como o projeto decide entre nuvem e demo

- Se `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` estiverem preenchidos, o app entra em **modo nuvem** e mostra a tela de login com Google.
- Se essas variáveis estiverem vazias, o app entra em **modo demo local**.

## Importante

- O servidor local lê `.env.local` automaticamente.
- O navegador recebe a configuração pelo endpoint `/api/config`.
- Você não precisa editar `config.js`.

## Publicar

Na Vercel, configure estas variáveis de ambiente:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `TMDB_READ_ACCESS_TOKEN`

Também rode `supabase/schema.sql` no seu projeto Supabase e ative o provider Google em **Authentication → Sign In / Providers → Google**.
