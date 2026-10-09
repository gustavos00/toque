# Ligar o Toque ao Google Calendar

Com esta integração, o Toque cria um calendário próprio chamado **"Toque"** na sua conta Google e põe lá as tarefas (fim da máquina, dias do lixo, tarefas periódicas). Os eventos **não têm lembretes** — os avisos continuam a ser do ntfy — e são **apagados** quando a tarefa fica feita.

O Toque só pede acesso aos calendários **que ele próprio cria** (`calendar.app.created`). Não consegue ler nem alterar os seus outros calendários.

É gratuito. Tempo estimado: 20 minutos. Precisa do Toque já publicado (ver [deploy.md](deploy.md)).

## 1. Criar o projeto no Google Cloud

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) com a conta Google onde quer o calendário.
2. Se for a primeira vez, aceite os termos. **Não é preciso ativar faturação** nem o período experimental.
3. No seletor de projetos (barra de cima) → **Novo projeto** → nome `Toque` → **Criar**. Confirme que o projeto `Toque` fica selecionado.
4. Menu → **APIs e serviços → Biblioteca** → procure **Google Calendar API** → **Ativar**.

## 2. Ecrã de consentimento OAuth

Menu → **APIs e serviços → Ecrã de consentimento OAuth** (na consola nova chama-se **Google Auth Platform**; carregue em **Começar**).

1. **Informações da app**
   - Nome da app: `Toque`
   - E-mail de apoio ao utilizador: o seu e-mail
2. **Público-alvo**: **Externo**.
3. **Informações de contacto** (contacto do programador): o seu e-mail.
4. Aceite a política de dados de utilizador → **Criar**.
5. **Acesso a dados** (ou *Âmbitos*) → **Adicionar ou remover âmbitos** e marque:
   - `.../auth/calendar.app.created` — *Criar calendários secundários e gerir os respetivos eventos* (se não aparecer na lista, cole `https://www.googleapis.com/auth/calendar.app.created` em *Adicionar âmbitos manualmente*);
   - `openid`;
   - `.../auth/userinfo.email` (aparece como `email`).

   **Atualizar** → **Guardar**.

### Publicar a app ("Em produção")

Em **Público-alvo** (ou no ecrã de consentimento), em *Estado da publicação*, carregue em **Publicar app** → **Confirmar**. O estado passa de *Em teste* para **Em produção**.

**Porquê:** enquanto a app está *Em teste*, a Google **invalida o acesso ao fim de 7 dias** (o *refresh token* expira). O Toque deixaria de conseguir escrever no calendário todas as semanas e teria de voltar a ligar à mão.

Publicar **não** torna nada público: só quem tiver o link e fizer login com a própria conta pode autorizar, e cada conta só dá acesso aos seus dados. Como é uma app pessoal e não verificada pela Google, aparece um aviso no passo 5 — é esperado. Não peça a verificação: não é preciso para uso próprio (o limite de 100 utilizadores de uma app não verificada chega perfeitamente).

## 3. Criar o cliente OAuth

Menu → **APIs e serviços → Credenciais** (ou **Google Auth Platform → Clientes**) → **Criar credenciais → ID de cliente OAuth**.

1. Tipo de aplicação: **Aplicação Web**.
2. Nome: `Toque`.
3. **URIs de redirecionamento autorizados** → **Adicionar URI**, um de cada vez, exatamente assim:
   - `https://toque-two.vercel.app/api/google/callback` (troque pelo seu endereço se for outro);
   - `http://localhost:3000/api/google/callback` (só para desenvolvimento).

   Se usar um domínio próprio, acrescente também `https://<o-seu-domínio>/api/google/callback`.
4. *Origens JavaScript autorizadas*: deixe vazio.
5. **Criar**. Aparece o **ID do cliente** (termina em `.apps.googleusercontent.com`) e o **Segredo do cliente**. Deixe a janela aberta para o passo seguinte — e **não cole o segredo em chats, e-mails ou no Git**.

## 4. Guardar as variáveis no Vercel

Na pasta do projeto (com `npx vercel link` já feito — ver [deploy.md](deploy.md)):

```bash
bash scripts/setup-vercel-env.sh --google
```

O script pergunta o ID do cliente e o segredo (o segredo não aparece no ecrã enquanto escreve) e envia-os diretamente para o Vercel. Cria:

| Variável | O que é |
| --- | --- |
| `GOOGLE_CLIENT_ID` | O ID do cliente OAuth. |
| `GOOGLE_CLIENT_SECRET` | O segredo do cliente OAuth. |
| `TOQUE_ENCRYPTION_KEY` | Gerada pelo script (`openssl rand -base64 32`). Cifra o acesso à conta Google guardado na base de dados. |

Se `TOQUE_ENCRYPTION_KEY` já existir, o script mantém-na (a não ser que responda `s`): uma chave nova torna ilegível o acesso guardado e obriga a ligar de novo ao Google.

<details>
<summary>Sem o script (à mão)</summary>

Vercel → projeto → **Settings → Environment Variables**, ambiente **Production**, marque **Sensitive**:

- `GOOGLE_CLIENT_ID` = ID do cliente
- `GOOGLE_CLIENT_SECRET` = segredo do cliente
- `TOQUE_ENCRYPTION_KEY` = o resultado de `openssl rand -base64 32`

</details>

Para desenvolvimento local, ponha as mesmas três variáveis em `.env.local` (nunca no Git).

## 5. Redeploy e ligar

1. Vercel → **Deployments → ⋯ → Redeploy** (as variáveis novas só contam a partir do deploy seguinte).
2. No Toque: **Definições → Ligar ao Google**.
3. Escolha a conta Google.
4. Aparece **"A Google não validou esta app"**. É normal (passo 2): toque em **Avançado** (ou *Avançadas*) → **Ir para Toque (não seguro)** — o texto exato varia; em inglês é *Advanced → Go to Toque (unsafe)*.
5. Confirme o acesso (*criar calendários secundários e gerir os respetivos eventos*) → **Continuar**.
6. Volta às Definições, que mostram a conta ligada. No Google Calendar aparece o calendário **Toque** (no iPhone, em Calendário → *Calendários*, ative-o se não aparecer).

## Desligar ou mudar de conta

- No Toque: **Definições → Desligar do Google**.
- Para revogar também do lado da Google: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → **Toque** → **Remover acesso**.
- O calendário "Toque" pode ser apagado à mão no Google Calendar, se já não o quiser.

## Problemas comuns

| Erro | Causa | O que fazer |
| --- | --- | --- |
| `redirect_uri_mismatch` | O URI no passo 3 não é igual ao endereço da app | Confirme `https://`, o domínio exato e o caminho `/api/google/callback`, sem `/` no fim. As alterações podem demorar uns minutos. |
| `access_denied` / *app em teste* | A app ainda está *Em teste* e a conta não está na lista de testadores | Publique a app (passo 2). |
| Deixou de funcionar ao fim de 7 dias | A app ficou *Em teste* | Publique a app e volte a **Ligar ao Google**. |
| `invalid_client` | ID ou segredo errados | Corra de novo `bash scripts/setup-vercel-env.sh --google` e faça *Redeploy*. |
| "Ligar ao Google" não aparece ou dá erro de configuração | Faltam variáveis ou não fez *Redeploy* | Passos 4 e 5. |
