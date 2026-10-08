# Pôr o Toque online (gratuito)

Tudo neste guia usa planos **gratuitos**: Vercel Hobby, Neon Free (através do Vercel Marketplace), cron-job.org e ntfy.sh. Só o domínio próprio é pago (e é opcional — o endereço `*.vercel.app` também funciona).

Tempo estimado: 30–45 minutos.

## 0. O que precisa

- Conta no [GitHub](https://github.com) com o repositório do Toque.
- Conta no [Vercel](https://vercel.com/signup) (entre com o GitHub, plano **Hobby**).
- Conta no [cron-job.org](https://console.cron-job.org/signup).
- A app **ntfy** no iPhone — ver [ntfy.md](ntfy.md).
- No computador: Node.js 22+ e `openssl` (já vem no macOS).

## 1. Importar o projeto no Vercel

1. Vercel → **Add New… → Project** → escolha o repositório `toque` → **Import**.
2. *Framework Preset*: **Next.js** (deteção automática). Não mude os comandos de build.
3. **Ainda não carregue em Deploy** se o ecrã o permitir sem variáveis — se já fez deploy, não faz mal: vai falhar ou ficar sem base de dados até ao passo 4, e fazemos *Redeploy* no fim.

> A região das funções está fixada em **Frankfurt (`fra1`)** no `vercel.json`, para ficar perto de Lisboa e da base de dados. Não precisa de mexer nisso.

## 2. Criar a base de dados Neon (Vercel Marketplace)

1. No projeto, separador **Storage** → **Create Database** → **Neon** (Serverless Postgres) → **Continue**.
2. Aceite a criação da conta Neon ligada ao Vercel.
3. Plano: **Free**. Região: **AWS Europe Central 1 (Frankfurt)** — `aws-eu-central-1`.
4. Nome: `toque`. **Create**.
5. Em *Connect Project*, escolha o projeto `toque` e marque os ambientes **Production** e **Preview** (e *Development*, se quiser usar `vercel env pull`). Prefixo das variáveis: deixe vazio, para que a variável se chame exatamente `DATABASE_URL`.
6. Confirme em **Settings → Environment Variables** que existe `DATABASE_URL` (o Neon também cria outras, como `DATABASE_URL_UNPOOLED`, `PGHOST`… — podem ficar).

Sem `DATABASE_URL`, o Toque usa PGlite (uma base de dados local em ficheiro). Isso só serve no computador — no Vercel o disco é temporário, por isso a variável é obrigatória em produção.

## 3. Gerar os segredos

No terminal do Mac, gere **um valor diferente para cada segredo**:

```bash
openssl rand -base64 32   # TOQUE_SESSION_SECRET
openssl rand -base64 32   # TOQUE_CRON_SECRET
openssl rand -base64 32   # TOQUE_ACTION_SECRET
echo "toque-$(openssl rand -hex 16)"   # NTFY_TOPIC
```

> O `TOQUE_CRON_SECRET` vai num cabeçalho HTTP. Se o valor tiver `+` ou `/` não há problema, mas se preferir algo mais fácil de copiar use `openssl rand -hex 32`.

Escolha também a palavra-passe de entrada (`TOQUE_PASSWORD`): longa, só sua, e guarde-a no gestor de palavras-passe do iPhone.

## 4. Variáveis de ambiente no Vercel

Projeto → **Settings → Environment Variables**. Para cada linha: *Key*, *Value*, ambiente **Production** (e *Preview* se quiser testar ramos), marque **Sensitive** nos segredos, **Save**.

| Variável | Obrigatória | Valor |
| --- | --- | --- |
| `DATABASE_URL` | sim | Criada pelo Neon no passo 2. Não mexa. |
| `TOQUE_PASSWORD` | sim | A palavra-passe de entrada na app. |
| `TOQUE_SESSION_SECRET` | sim | `openssl rand -base64 32` — assina o cookie da sessão. |
| `TOQUE_CRON_SECRET` | sim | `openssl rand -base64 32` — protege `/api/tick`. |
| `TOQUE_ACTION_SECRET` | recomendada | `openssl rand -base64 32` — assina os botões das notificações ("Feito", "Adiar"); mínimo 16 caracteres. Sem ela, as notificações chegam sem botões. |
| `NTFY_TOPIC` | sim, se não o definir nas Definições da app | O tópico aleatório — ver [ntfy.md](ntfy.md). O tópico das Definições tem prioridade. |
| `NTFY_BASE_URL` | não | Só se não usar `https://ntfy.sh`. Um servidor alterado nas Definições da app tem prioridade. |
| `NTFY_TOKEN` | não | Só para servidores ntfy com autenticação (só existe como variável de ambiente). |
| `TOQUE_PUBLIC_URL` | recomendada | Endereço público, sem `/` no fim, ex.: `https://toque.example.pt`. É usado para montar os URLs das tags e os links das notificações. Sem ela, as tags usam o endereço por onde abriu a app e as notificações o domínio de produção do Vercel (automático), por isso no Vercel não é estritamente obrigatória — mas com domínio próprio deve defini-la. |

Não defina `TOQUE_PGLITE_DIR` nem `NEXT_PUBLIC_TOQUE_MOCKS` no Vercel — são só para desenvolvimento e testes.

Mudar uma variável **não** atualiza o deploy em curso: depois de alterar, vá a **Deployments → ⋯ → Redeploy**.

Se um segredo for exposto, gere outro e faça *Redeploy*. Trocar `TOQUE_SESSION_SECRET` termina todas as sessões (volta a pedir a palavra-passe); trocar `TOQUE_ACTION_SECRET` invalida os botões de notificações já enviadas.

## 5. Criar as tabelas (migrações)

As migrações correm a partir do seu computador, contra a base de dados Neon.

1. Copie o `DATABASE_URL` de produção: Vercel → **Storage → toque → .env.local** (ou *Settings → Environment Variables* → mostrar valor). Em alternativa, com a CLI do Vercel: `npx vercel link` e `npx vercel env pull .env.production.local --environment=production`.
2. Na pasta do projeto:

   ```bash
   npm ci
   DATABASE_URL='postgresql://…neon.tech/neondb?sslmode=require' npm run db:migrate
   ```

3. Deve terminar sem erros. Correr de novo não faz mal: as migrações já aplicadas são ignoradas.

Repita este passo sempre que uma atualização do Toque trouxer novas migrações (pasta `drizzle/`).

Apague o ficheiro `.env.production.local` se o descarregou — não o deixe no disco nem no Git (o `.gitignore` já ignora `.env*`).

## 6. Fazer o deploy

**Deployments → ⋯ → Redeploy** (ou faça `git push` para o ramo principal). Quando ficar *Ready*, abra o endereço `https://toque-xxxx.vercel.app`, entre com a palavra-passe e confirme que o painel aparece.

No iPhone: abra o endereço no **Safari** → botão Partilhar → **Adicionar ao ecrã principal**.

## 7. Domínio próprio (opcional)

1. Projeto → **Settings → Domains** → **Add** → escreva, por exemplo, `toque.example.pt`.
2. O Vercel mostra o registo DNS a criar:
   - subdomínio (`toque.example.pt`): registo **CNAME** `toque` → `cname.vercel-dns.com` (use o valor exato que o Vercel indicar);
   - domínio raiz (`example.pt`): registo **A** `@` → o IP que o Vercel indicar.
3. Crie o registo no painel do seu registador (PTisp, Amen, Cloudflare…). Se usar Cloudflare, ponha o registo em **DNS only** (nuvem cinzenta).
4. Espere até o Vercel mostrar **Valid Configuration** (minutos a algumas horas). O certificado HTTPS é automático.
5. Atualize `TOQUE_PUBLIC_URL` para `https://toque.example.pt` e faça *Redeploy*.

**Escolha o domínio antes de gravar as tags** — o URL fica gravado em cada tag (ver [tags-nfc.md](tags-nfc.md)).

## 8. Cron: chamar `/api/tick` a cada minuto (cron-job.org)

O plano Hobby do Vercel só permite crons uma vez por dia, por isso usamos o cron-job.org (grátis) para chamar o Toque a cada minuto. É esse "tique" que envia as notificações que estão na hora.

1. [console.cron-job.org](https://console.cron-job.org) → **Create cronjob**.
2. **Common**:
   - *Title*: `Toque tick`
   - *URL*: `https://toque.example.pt/api/tick` (ou o endereço `*.vercel.app`)
   - *Enable job*: ligado
   - *Execution schedule*: **Every 1 minute(s)**
3. **Advanced**:
   - *Request method*: **GET**
   - *Headers* → **Add header**: Key `Authorization`, Value `Bearer <TOQUE_CRON_SECRET>` (a palavra `Bearer`, um espaço, e o segredo — sem aspas)
   - *Timeout*: 30 segundos
   - *Treat redirects with HTTP 3xx status code as success*: **desligado** (um redirecionamento quer dizer que o endereço está errado, por exemplo `http://` ou sem `www`)
4. **Notifications** (em *Settings* da conta ou do job): ative *Notify me when … execution of the job fails* e *… the job will be disabled because of too many failures*.
5. **Create**. Depois use **Test run** (ou *Perform test run*): a resposta deve ser **200**.

Verificação manual no terminal:

```bash
curl -i -H "Authorization: Bearer $TOQUE_CRON_SECRET" https://toque.example.pt/api/tick
# HTTP/2 200

curl -i https://toque.example.pt/api/tick
# HTTP/2 401  ← sem segredo tem de ser recusado
```

### Se o cron falhar

Veja o histórico em cron-job.org → **History** → clique na execução para ver o código e a resposta.

| Código | Causa provável | O que fazer |
| --- | --- | --- |
| **401** | Cabeçalho em falta ou segredo errado | Confirme `Bearer ` + segredo, sem espaços a mais; confirme que o valor é igual a `TOQUE_CRON_SECRET` no Vercel e que fez *Redeploy* depois de o alterar. |
| **404** | URL errado | Tem de terminar em `/api/tick`. |
| **3xx** | Redirecionamento | Use `https://` e o domínio exato (com/sem `www`) que o Vercel serve. |
| **500** | Erro na app | Vercel → projeto → **Logs**, filtre por `/api/tick`. Causa comum: faltam migrações (passo 5) ou `DATABASE_URL`. |
| **Timeout** | Base de dados a "acordar" | O Neon Free suspende a BD sem uso; o primeiro pedido demora uns segundos. Com o cron a cada minuto raramente acontece. Se se repetir, suba o *timeout* para 30 s. |

O cron-job.org **desativa o job** depois de muitas falhas seguidas. Depois de corrigir, volte a ligar *Enable job*.

## 9. Verificar com uma notificação de teste

1. Confirme que subscreveu o tópico na app ntfy ([ntfy.md](ntfy.md)) e que um `curl` de teste chega ao iPhone.
2. No Toque, crie uma tarefa **Temporizador** com duração de **1 minuto** e crie a tag dessa tarefa.
3. Abra o URL da tag (`https://…/t/<token>`) no iPhone — deve aparecer a confirmação de que o temporizador começou.
4. Em 1–2 minutos (o próximo "tique" do cron) deve chegar a notificação de fim no iPhone.
5. Se não chegar: veja o histórico do cron-job.org (passo 8), os **Logs** do Vercel e se o tópico está certo (o das Definições da app, se preenchido, ou `NTFY_TOPIC`). Lembre-se de que o Toque não envia avisos durante as **horas de silêncio** (por omissão 23:00–07:30), configuráveis nas definições.

Depois do teste, apague a tarefa de 1 minuto (ou mude a duração) e grave as tags definitivas — ver [tags-nfc.md](tags-nfc.md).

## Resumo dos limites gratuitos

- **Vercel Hobby**: uso pessoal, não comercial; folga de sobra para 1 utilizador e 1 pedido de cron por minuto (~43 200 pedidos/mês).
- **Neon Free**: 0,5 GB de armazenamento; a base de dados suspende-se após uns minutos sem uso e acorda no pedido seguinte.
- **cron-job.org**: grátis, execuções até 1 por minuto.
- **ntfy.sh**: grátis, sem conta; limite generoso de mensagens por dia para um tópico pessoal.
