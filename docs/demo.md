# Demonstração pública

A demonstração é uma instalação à parte do Toque, aberta a qualquer pessoa, para experimentar a app sem mexer na instalação pessoal. Usa o **mesmo código** (mesmo repositório) com `NEXT_PUBLIC_TOQUE_DEMO=1`.

## O que o visitante vê

- **Login com a palavra-passe `demo` já preenchida** (e visível): basta carregar em **Entrar**. Em modo demo, a `TOQUE_PASSWORD` do servidor é ignorada — só `demo` entra.
- Uma etiqueta **"Demonstração"** no cabeçalho de cada ecrã.
- Tudo o que é das tarefas funciona: criar e editar tarefas, criar tags, abrir `/t/<token>` (o toque), painel e histórico.

## O que está bloqueado

| Funcionalidade | Na interface | No servidor |
| --- | --- | --- |
| **ntfy** (notificações) | O campo *Tópico* aparece desativado, com "Indisponível na demonstração". | Um `PATCH /api/settings` que mexa em `ntfy` responde **403** `{ "error": "Indisponível na demonstração" }`. O motor não envia nada (o notificador é um *no-op*). |
| **Google Calendar** | A secção aparece, mas **Ligar ao Google** está desativado. | `/api/google/connect` e `/api/google/callback` redirecionam para `/definicoes?google=demo`; `resync` e `disconnect` respondem **403**. O calendário é um *no-op*. |

O resto das definições (horas de silêncio, valores por omissão) pode ser alterado.

## Dados apagados a cada 5 minutos

A base de dados da demonstração **limpa-se sozinha**: o primeiro pedido feito depois de passarem 5 minutos desde a última limpeza apaga **tarefas, tags, histórico, notificações pendentes e definições** (função `maybeResetDemoData`). Não há cron nem segredo envolvidos — é "preguiçoso": sem visitas, nada corre.

Consequência: um visitante pode ver os dados desaparecer a meio da visita. Não guarde lá nada.

## Dados pessoais

A demonstração **não tem dados pessoais**: base de dados própria e vazia, sem tópico ntfy, sem ligação Google, e a palavra-passe é pública. Os segredos de sessão em modo demo são fixos e públicos de propósito (não protegem nada que importe); **nunca** ative `NEXT_PUBLIC_TOQUE_DEMO` na instalação pessoal.

## Como está publicada

É um **segundo projeto Vercel** (`toque-demo`), ligado ao mesmo repositório, com a sua **própria base de dados Neon** (vazia):

1. Vercel → **Add New… → Project** → o mesmo repositório → nome `toque-demo`.
2. **Storage → Create Database → Neon** (Free, Frankfurt), ligada só a `toque-demo`, prefixo `DATABASE` — ver [deploy.md](deploy.md), passo 3. **Não reutilize a base de dados pessoal.**
3. **Settings → Environment Variables** (Production):

   | Variável | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_TOQUE_DEMO` | `1` |
   | `DATABASE_URL` | criada pelo Neon |

   Não ponha `NTFY_*`, `GOOGLE_*`, `TOQUE_ENCRYPTION_KEY` nem segredos da instalação pessoal. Como `NEXT_PUBLIC_*` fica embutido no build, mudar esta variável exige **Redeploy**.

4. O build é o mesmo do projeto principal (`npm run db:migrate && npm run build`, no `vercel.json`), por isso as migrações correm em cada deploy.
5. Não é preciso cron-job.org: sem ntfy não há avisos a enviar, e a limpeza dos dados não depende do cron.

## Testes

```bash
npm run test:e2e:demo
```

Faz um build próprio com `NEXT_PUBLIC_TOQUE_DEMO=1` em `.next-demo` (para não estragar o build normal em `.next`) e serve-o na porta 4421 com uma BD PGlite em memória. Verifica o login com `demo`, os campos desativados, os 403/redirecionamentos do ntfy e do Google, e que tarefas, tags e o toque em `/t/<token>` funcionam. A limpeza de 5 minutos é testada nos testes unitários (sem esperar 5 minutos reais).
