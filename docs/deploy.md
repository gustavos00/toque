# Pôr o Toque online (gratuito)

Tudo neste guia usa planos **gratuitos**: Vercel Hobby, Neon Free (através do Vercel Marketplace), cron-job.org e ntfy.sh. Só o domínio próprio é pago (e é opcional — o endereço `*.vercel.app` também funciona).

Tempo estimado: 30–45 minutos. É assim que está publicado o Toque em `https://toque-two.vercel.app`.

## 0. O que precisa

- Conta no [GitHub](https://github.com) com o repositório do Toque.
- Conta no [Vercel](https://vercel.com/signup) (entre com o GitHub, plano **Hobby**).
- Conta no [cron-job.org](https://console.cron-job.org/signup).
- A app **ntfy** no iPhone — ver [ntfy.md](ntfy.md).
- No computador: Node.js 22+ e `openssl` (já vem no macOS).

## 1. Autor dos commits (e-mail noreply do GitHub)

O Vercel Hobby **bloqueia o deploy** quando o autor do commit não corresponde a uma conta GitHub ligada ao Vercel. O erro aparece como *"couldn't find a Git account for the commit author"*. Use o e-mail **noreply** do GitHub no repositório do Toque:

1. GitHub → **Settings → Emails**: copie o endereço `NNNNNNNN+utilizador@users.noreply.github.com` (e, já agora, ative *Keep my email addresses private*).
2. Na pasta do projeto (só neste repositório):

   ```bash
   git config user.email "NNNNNNNN+utilizador@users.noreply.github.com"
   git config user.name "O seu nome"
   ```

3. Se já tiver commits com outro e-mail por publicar, corrija o último com `git commit --amend --reset-author --no-edit`. Um commit vazio também força um novo deploy: `git commit --allow-empty -m "chore: trigger production deploy"`.

## 2. Importar o projeto no Vercel

1. Vercel → **Add New… → Project** → escolha o repositório `toque` → **Import**.
2. *Framework Preset*: **Next.js** (deteção automática). Não mude os comandos: o `vercel.json` já define o build como `npm run db:migrate && npm run build`.
3. O primeiro deploy **vai falhar** (ainda não há base de dados — o `db:migrate` recusa-se a continuar sem `DATABASE_URL`). É normal; volta a correr no passo 5.

O que o `vercel.json` faz:

- `regions: ["fra1"]` — as funções correm em Frankfurt, perto de Lisboa e da base de dados.
- `buildCommand` — **aplica as migrações em cada deploy**, antes do `next build`. Não precisa de correr migrações à mão.

O projeto fica em `https://<nome-do-projeto>.vercel.app` (ex.: `https://toque-two.vercel.app`).

## 3. Criar a base de dados Neon (Vercel Marketplace)

1. No projeto, separador **Storage** → **Create Database** → **Neon** (Serverless Postgres) → **Continue**.
2. Aceite a criação da conta Neon ligada ao Vercel.
3. Plano: **Free**. Região: **AWS Europe Central 1 (Frankfurt)** — `aws-eu-central-1`.
4. Nome: `toque`. **Create**.
5. Em *Connect Project*, escolha o projeto `toque`, marque **Production** e **Preview** e, em *Environment Variables Prefix*, escreva **`DATABASE`**. Assim a variável chama-se exatamente `DATABASE_URL`, que é o nome que o Toque lê.
6. Confirme em **Settings → Environment Variables** que existe `DATABASE_URL` (o Neon cria também `DATABASE_URL_UNPOOLED`, `DATABASE_PGHOST`… — podem ficar).

Sem `DATABASE_URL`, o Toque usaria PGlite (ficheiro local), que só serve no computador; no Vercel o build falha de propósito com *"DATABASE_URL em falta"*.

## 4. Segredos com o script (recomendado)

O script `scripts/setup-vercel-env.sh` gera os segredos no seu computador e envia-os diretamente para o Vercel — não ficam em ficheiros, nem no Git, nem em mensagens. **Corra-o você**; não cole segredos em chats.

```bash
npm ci
npx vercel login          # uma vez
npx vercel link           # escolha o projeto toque
bash scripts/setup-vercel-env.sh
```

O script pede a palavra-passe de entrada (duas vezes, sem a mostrar) e cria em **Production**:

| Variável | Valor |
| --- | --- |
| `TOQUE_PASSWORD` | A palavra-passe que escreveu. |
| `TOQUE_SESSION_SECRET` | Aleatório — assina o cookie da sessão. |
| `TOQUE_ACTION_SECRET` | Aleatório — assina os botões "Feito" / "Adiar" das notificações. |
| `TOQUE_CRON_SECRET` | Aleatório (hex) — protege `/api/tick`. |

No fim **mostra uma vez** o valor `Bearer …` do cron: copie-o já para o cron-job.org (passo 8) ou para o gestor de palavras-passe.

Para a integração com o Google Calendar, corra também `bash scripts/setup-vercel-env.sh --google` — ver [google-calendar.md](google-calendar.md).

Correr o script de novo **troca** os segredos: as sessões terminam (volta a pedir a palavra-passe), os botões das notificações antigas deixam de funcionar e tem de atualizar o cabeçalho no cron-job.org.

### Outras variáveis (opcionais)

Em **Settings → Environment Variables** (marque *Sensitive* nos segredos):

| Variável | Quando |
| --- | --- |
| `TOQUE_PUBLIC_URL` | Só com domínio próprio, ex.: `https://toque.example.pt` (sem `/` no fim). Sem ela, as tags usam o endereço por onde abriu a app e as notificações o domínio de produção do Vercel. |
| `NTFY_TOPIC` | Normalmente não é preciso: o tópico escolhe-se nas **Definições** da app (que têm prioridade). Ver [ntfy.md](ntfy.md). |
| `NTFY_BASE_URL`, `NTFY_TOKEN` | Só para um servidor ntfy próprio ou com autenticação. |

Não defina `TOQUE_PGLITE_DIR` nem `NEXT_PUBLIC_TOQUE_MOCKS` no Vercel — são só para desenvolvimento e testes.

## 5. Fazer o deploy

Mudar variáveis **não** atualiza o deploy em curso. Depois do passo 4: **Deployments → ⋯ → Redeploy** (ou `git push` para o ramo principal).

No log do build deve ver `Migrações aplicadas (Neon).` antes do `next build`. Quando ficar *Ready*, abra `https://toque-two.vercel.app` (ou o seu endereço), entre com a palavra-passe e confirme que o painel aparece.

No iPhone: abra o endereço no **Safari** → botão Partilhar → **Adicionar ao ecrã principal**.

Se o deploy falhar:

| Mensagem | O que fazer |
| --- | --- |
| *couldn't find a Git account for the commit author* | Autor do commit com e-mail errado — passo 1. |
| *DATABASE_URL em falta* | A BD não está ligada ao projeto ou o prefixo não é `DATABASE` — passo 3. |
| Erro nas migrações | Veja a mensagem no log do build; o deploy anterior continua no ar. |

## 6. Atualizações

Cada `git push` para o ramo principal faz deploy e aplica as migrações novas automaticamente. Garanta só que os commits usam o e-mail noreply (passo 1).

## 7. Domínio próprio (opcional)

1. Projeto → **Settings → Domains** → **Add** → escreva, por exemplo, `toque.example.pt`.
2. O Vercel mostra o registo DNS a criar:
   - subdomínio (`toque.example.pt`): registo **CNAME** `toque` → `cname.vercel-dns.com` (use o valor exato que o Vercel indicar);
   - domínio raiz (`example.pt`): registo **A** `@` → o IP que o Vercel indicar.
3. Crie o registo no painel do seu registador (PTisp, Amen, Cloudflare…). Se usar Cloudflare, ponha o registo em **DNS only** (nuvem cinzenta).
4. Espere até o Vercel mostrar **Valid Configuration** (minutos a algumas horas). O certificado HTTPS é automático.
5. Crie `TOQUE_PUBLIC_URL` = `https://toque.example.pt` e faça *Redeploy*.
6. Se usar o Google Calendar, acrescente o novo endereço de redirecionamento no Google Cloud — ver [google-calendar.md](google-calendar.md).

**Escolha o domínio antes de gravar as tags** — o URL fica gravado em cada tag (ver [tags-nfc.md](tags-nfc.md)).

## 8. Cron: chamar `/api/tick` a cada minuto (cron-job.org)

O plano Hobby do Vercel só permite crons uma vez por dia, por isso usamos o cron-job.org (grátis) para chamar o Toque a cada minuto. É esse "tique" que envia as notificações que estão na hora.

1. [console.cron-job.org](https://console.cron-job.org) → **Create cronjob**.
2. **Common**:
   - *Title*: `Toque tick`
   - *URL*: `https://toque-two.vercel.app/api/tick` (ou o seu domínio)
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
curl -i -H "Authorization: Bearer <segredo do cron>" https://toque-two.vercel.app/api/tick
# HTTP/2 200

curl -i https://toque-two.vercel.app/api/tick
# HTTP/2 401  ← sem segredo tem de ser recusado
```

### Se o cron falhar

Veja o histórico em cron-job.org → **History** → clique na execução para ver o código e a resposta.

| Código | Causa provável | O que fazer |
| --- | --- | --- |
| **401** | Cabeçalho em falta ou segredo errado | Confirme `Bearer ` + segredo, sem espaços a mais; confirme que é o valor que o script mostrou (se voltou a correr o script, o segredo mudou) e que fez *Redeploy* depois de o alterar. |
| **404** | URL errado | Tem de terminar em `/api/tick`. |
| **3xx** | Redirecionamento | Use `https://` e o domínio exato (com/sem `www`) que o Vercel serve. |
| **500** | Erro na app | Vercel → projeto → **Logs**, filtre por `/api/tick`. Causa comum: falta `DATABASE_URL` (passo 3) ou o último deploy falhou nas migrações. |
| **Timeout** | Base de dados a "acordar" | O Neon Free suspende a BD sem uso; o primeiro pedido demora uns segundos. Com o cron a cada minuto raramente acontece. Se se repetir, suba o *timeout* para 30 s. |

O cron-job.org **desativa o job** depois de muitas falhas seguidas. Depois de corrigir, volte a ligar *Enable job*.

## 9. Verificar com uma notificação de teste

1. Confirme que subscreveu o tópico na app ntfy ([ntfy.md](ntfy.md)) e que um `curl` de teste chega ao iPhone.
2. No Toque, crie uma tarefa **Temporizador** com duração de **1 minuto** (desligue o aviso "quase a acabar", que tem de ser antes do fim) e crie a tag dessa tarefa.
3. Abra o URL da tag (`https://…/t/<token>`) no iPhone — deve aparecer a confirmação de que o temporizador começou.
4. Em 1–2 minutos (o próximo "tique" do cron) deve chegar a notificação de fim no iPhone.
5. Se não chegar: veja o histórico do cron-job.org (passo 8), os **Logs** do Vercel e se o tópico está certo (o das Definições da app, se preenchido, ou `NTFY_TOPIC`). Lembre-se de que o Toque não envia avisos durante as **horas de silêncio** (por omissão 23:00–07:30), configuráveis nas definições.

Depois do teste, apague a tarefa de 1 minuto (ou mude a duração) e grave as tags definitivas — ver [tags-nfc.md](tags-nfc.md).

## Resumo dos limites gratuitos

- **Vercel Hobby**: uso pessoal, não comercial; folga de sobra para 1 utilizador e 1 pedido de cron por minuto (~43 200 pedidos/mês).
- **Neon Free**: 0,5 GB de armazenamento; a base de dados suspende-se após uns minutos sem uso e acorda no pedido seguinte.
- **cron-job.org**: grátis, execuções até 1 por minuto.
- **ntfy.sh**: grátis, sem conta; limite generoso de mensagens por dia para um tópico pessoal.
