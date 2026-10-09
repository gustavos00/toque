# Notificações com ntfy

O Toque não envia notificações push diretamente: publica mensagens num **tópico** do [ntfy.sh](https://ntfy.sh) e a app ntfy do iPhone mostra-as. É gratuito e não precisa de conta.

## 1. Instalar a app

1. No iPhone, abra a App Store e instale **ntfy** (programador: Philipp Heckel).
2. Abra a app e, quando pedir, **permita as notificações**.
3. Em *Definições → Notificações → ntfy*, confirme que estão ativas as opções *Ecrã bloqueado*, *Central de notificações* e *Faixas*. Se quiser que os alertas do lixo furem o modo Foco, ative também *Notificações sensíveis ao tempo*.

## 2. Escolher um tópico aleatório

No ntfy.sh público **não há palavras-passe**: quem souber o nome do tópico consegue ler as suas notificações e enviar mensagens falsas para o seu telemóvel. O nome do tópico é, por isso, **o único segredo**. Tem de ser longo e impossível de adivinhar — nada de `toque`, `casa-<o-seu-nome>` ou parecido.

Gere um no Mac/Linux:

```bash
echo "toque-$(openssl rand -hex 16)"
# exemplo: toque-3f9c2a7b1e6d4058a2c7e9b0d1f4a6c8
```

Guarde esse valor: é o `NTFY_TOPIC` que vai pôr no Vercel (ver [deploy.md](deploy.md)). Não o publique no Git, em capturas de ecrã nem em mensagens.

## 3. Subscrever o tópico no iPhone

1. Na app ntfy, toque em **+** (canto superior direito).
2. Em *Topic name*, cole o tópico gerado acima.
3. Deixe *Use another server* desligado (usa `https://ntfy.sh`), a não ser que tenha o seu próprio servidor — nesse caso use o mesmo endereço que pôs em `NTFY_BASE_URL`.
4. Toque em **Subscribe**.

## 4. Testar com `curl`

Num terminal (substitua pelo seu tópico):

```bash
curl -d "Teste do Toque 👋" https://ntfy.sh/toque-<o-seu-tópico>
```

Com título, prioridade e etiqueta (é o mesmo formato que o Toque usa):

```bash
curl \
  -H "Title: Máquina da roupa" \
  -H "Priority: high" \
  -H "Tags: basket" \
  -d "A roupa está pronta para estender." \
  https://ntfy.sh/toque-<o-seu-tópico>
```

A notificação deve aparecer no iPhone em poucos segundos. Se não aparecer:

- confirme que o tópico na app é **exatamente** igual (sem espaços no fim);
- abra a app ntfy uma vez — no iOS a primeira entrega pode depender disso;
- confirme as permissões em *Definições → Notificações → ntfy*;
- veja se o modo Foco está a silenciar a app.

## 5. Variáveis de ambiente usadas pelo Toque

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `NTFY_TOPIC` | sim, se não definir o tópico nas Definições | O tópico aleatório acima. |
| `NTFY_BASE_URL` | não | Servidor ntfy. Por omissão `https://ntfy.sh`. |
| `NTFY_TOKEN` | não | Só se usar um servidor ntfy com autenticação (ou uma conta ntfy.sh paga com tópicos reservados). Enviado como `Authorization: Bearer …`. Só existe como variável de ambiente. |
| `TOQUE_ACTION_SECRET` | recomendada | Pelo menos 16 caracteres. Assina os botões "Feito" / "Adiar" das notificações. |
| `TOQUE_PUBLIC_URL` | recomendada | Endereço público da app, usado nos botões e no link ao tocar na notificação. |

### Que valor ganha

As **Definições** da app ganham às variáveis de ambiente:

- **Tópico**: o das Definições, se estiver preenchido; senão `NTFY_TOPIC`.
- **Servidor**: o das Definições, só se o tiver mudado de `https://ntfy.sh`; senão `NTFY_BASE_URL`; se também estiver vazio, `https://ntfy.sh`.
- **Token**: só `NTFY_TOKEN` (não há campo nas Definições).

Sem tópico (nem nas Definições nem em `NTFY_TOPIC`), o envio fica desligado: o Toque continua a funcionar e os avisos ficam em espera. Quando configurar um tópico, envia apenas o aviso mais recente de cada tarefa (não chega uma avalanche de avisos antigos).

### Botões e link das notificações

- Sem `TOQUE_ACTION_SECRET` (ou com menos de 16 caracteres), as notificações chegam **sem botões** e `/api/actions/…` responde 403.
- O endereço dos botões e do link vem de `TOQUE_PUBLIC_URL`; se não existir, usa o domínio de produção do Vercel (`VERCEL_PROJECT_PRODUCTION_URL`, automático no Vercel). Sem nenhum dos dois, as notificações chegam sem botões e sem link.

## Mudar de tópico

Se suspeitar que o tópico foi exposto: gere outro, atualize-o nas Definições do Toque (ou em `NTFY_TOPIC` no Vercel, seguido de *Redeploy*), subscreva o novo tópico na app e apague o antigo (deslize para a esquerda na lista).
