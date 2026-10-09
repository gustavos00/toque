# Toque

Tarefas de casa ativadas por tags NFC. Uma PWA pessoal (um utilizador, iPhone, português, hora de Lisboa): encosta o telemóvel à tag, o Toque regista e trata dos lembretes por notificação ([ntfy](docs/ntfy.md)).

Cada tag guarda um endereço `https://<domínio>/t/<token>`. Abri-lo regista o toque — não precisa de sessão, o token é a credencial. O resto da app está protegido por uma palavra-passe única.

## Tipos de tarefa

| Tipo | Exemplo | Como funciona |
| --- | --- | --- |
| **Temporizador** (`timer`) | Máquina da roupa | A tag da máquina inicia a contagem e o Toque avisa quando acaba; lembretes opcionais de "roupa esquecida" até tocar na tag do estendal ("roupa estendida"). |
| **Até confirmar** (`until_ack`) | Lixo | Nos dias de recolha manda alertas cada vez mais insistentes até tocar na tag. |
| **Recorrente** (`recurring`) | Regar plantas | Fica pendente a cada N dias depois do último toque. |

## Funcionalidades

- **Toque sem login**: a tag abre `/t/<token>` e mostra a confirmação em português.
- **Várias tags por tarefa**, cada uma com a sua ação — "inicia" (ex.: máquina) ou "tratada" (ex.: estendal). As tarefas mostram as tags ligadas, na lista e no detalhe.
- **Notificações ntfy** com botões "Feito" / "Adiar", horas de silêncio e lembretes cada vez mais insistentes.
- **Painel** com temporizadores a decorrer, tarefas de hoje e periódicas; histórico de toques.
- **Google Calendar** (opcional): um calendário "Toque" só da app, eventos sem lembretes, apagados quando a tarefa fica feita — ver [google-calendar.md](docs/google-calendar.md).
- PWA instalável no ecrã principal do iPhone.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind · Drizzle ORM com **Neon Postgres** em produção e **PGlite** local (sem configuração) · Vercel Hobby (migrações aplicadas em cada deploy) · cron-job.org chama `/api/tick` a cada minuto · ntfy.sh para as notificações · Google Calendar API (OAuth, `calendar.app.created`).

Em produção: <https://toque-two.vercel.app>.

## Desenvolvimento

```bash
npm install
npm run dev          # http://localhost:3000 — PGlite em .data/pglite, migrado automaticamente
npm run board        # quadro local das tarefas dos agentes
```

Variáveis de ambiente: copie `.env.example` para `.env.local` e preencha (pelo menos `TOQUE_PASSWORD` e `TOQUE_SESSION_SECRET`). Sem `DATABASE_URL` usa PGlite.

## Testes e verificações

```bash
npm test             # testes unitários (Vitest)
npm run test:e2e     # ponta a ponta (Playwright, perfil iPhone/WebKit, porta 4417)
npm run test:e2e:demo  # o mesmo, contra um build de demonstração (porta 4421)
npm run lint
npm run typecheck
```

Na primeira vez: `npx playwright install webkit`. O e2e faz `next build` + `next start` na porta 4417 com uma BD PGlite em memória (pode correr ao lado do seu `npm run dev`). `E2E_SERVER=dev npm run test:e2e` arranca com `next dev` — mais rápido, mas pare antes o seu `next dev` (o Next 16 só permite um por pasta).

Base de dados: `npm run db:generate` (gera migrações a partir de `src/server/db/schema.ts`) e `npm run db:migrate` (aplica-as; com `DATABASE_URL` aplica no Neon).

## Documentação

- [Pôr online (Vercel + Neon + cron-job.org)](docs/deploy.md) — segredos com `bash scripts/setup-vercel-env.sh` (e `--google`)
- [Notificações com ntfy](docs/ntfy.md)
- [Gravar e colar as tags NFC](docs/tags-nfc.md)
- [Ligar ao Google Calendar](docs/google-calendar.md)
- [Demonstração pública](docs/demo.md)
