# Gravar e colar as tags NFC

Cada tarefa do Toque tem uma tag com um endereço único, do género:

```
https://toque.example.pt/t/AbC123…
```

Encostar o iPhone à tag abre esse endereço e regista o toque. **Não é preciso sessão iniciada**: o código no fim do endereço (o *token*) é a credencial. Trate-o como uma chave — quem o tiver pode registar toques nessa tarefa (e só nessa).

## 1. Que tags comprar

| Tag | Memória útil | Notas |
| --- | --- | --- |
| **NTAG213** | 144 bytes | Chega e sobra para um URL do Toque. A mais barata. |
| NTAG215 | 504 bytes | Também serve. |
| NTAG216 | 888 bytes | Também serve; só faz sentido se quiser guardar mais registos. |

Todas funcionam com o iPhone (XS ou mais recente lê tags em segundo plano).

**Superfícies metálicas** (máquina de lavar, frigorífico, porta metálica): uma tag normal colada diretamente no metal **não é lida** — o metal anula a antena. Use uma de:

- tags **on-metal / anti-metal** (têm uma camada de ferrite incorporada; procure "NTAG213 anti-metal");
- uma tag normal sobre uma **folha de ferrite** (vende-se em rolos/autocolantes "ferrite sheet NFC").

Em plástico, madeira ou vidro qualquer tag NTAG21x serve. Autocolantes redondos de 25–30 mm são um bom tamanho.

## 2. Obter o endereço da tag

No Toque, crie a tarefa e abra **a sua tag** (no ecrã da tarefa). Copie o endereço completo `https://…/t/<token>`. Uma tarefa pode ter **mais do que uma tag**, cada uma com o seu token e a sua ação. A máquina da roupa usa duas: uma tag **"inicia"** (na máquina, começa o temporizador) e uma tag **"estendida"** (no estendal, marca a roupa como estendida). O formato do endereço é o mesmo — só muda o token, por isso grave cada endereço na tag certa.

Use sempre o domínio definitivo (ver [deploy.md](deploy.md)) — se mudar de domínio terá de regravar todas as tags.

## 3. Gravar com a app NFC Tools (grátis)

1. Instale **NFC Tools** (wakdev) na App Store.
2. Abra a app → **Escrever** (*Write*).
3. **Adicionar um registo** → **URL / URI**.
4. Cole o endereço completo da tag (confirme que começa por `https://`) e toque em **OK**.
5. Toque em **Escrever / X bytes** e encoste o topo traseiro do iPhone à tag até aparecer o visto.
6. Teste: bloqueie e desbloqueie o iPhone, encoste-o à tag — deve aparecer uma notificação "Abrir no Safari" (ver secção 5).

Grave **um único registo URL** por tag. Registos extra (texto, contactos) podem impedir o iPhone de abrir o link em segundo plano.

## 4. Bloquear a tag (opcional — irreversível)

Em NFC Tools → **Outros** → **Bloquear tag** (*Lock tag*) a tag passa a ser só de leitura, para que ninguém a regrave com outro endereço.

> ⚠️ **É irreversível.** Uma tag bloqueada nunca mais pode ser gravada. Se depois regenerar o token da tarefa ou mudar de domínio, terá de deitar a tag fora e usar uma nova. Recomendação: só bloqueie depois de usar o Toque umas semanas com o domínio definitivo.

Não use a opção de "palavra-passe" do NFC Tools: o iPhone deixa de conseguir ler a tag em segundo plano em alguns modelos.

## 5. Como o iPhone abre o link

- Com o iPhone **desbloqueado** e o ecrã ligado, encoste o topo traseiro do telemóvel à tag.
- Aparece uma notificação do sistema; toque nela e o Safari (ou o Toque, se estiver instalado no ecrã principal) abre `https://…/t/<token>` e mostra a confirmação em português.
- Não funciona com o ecrã desligado, com a câmara aberta, durante uma chamada, nem no Centro de Controlo/Wallet.

## 6. Atalho opcional: registar sem abrir o Safari

Se preferir que o toque fique registado **sem abrir nenhuma página**, use uma automação da app **Atalhos**:

1. Atalhos → **Automação** → **+** → **NFC**.
2. Toque em **Ler** e encoste a tag; dê-lhe um nome (ex.: "Máquina").
3. Escolha **Executar imediatamente** e desligue "Notificar ao executar" se não quiser o aviso.
4. Ação: **Obter conteúdo do URL** com o endereço completo da tag (`https://…/t/<token>`), método **GET**.
5. (Opcional) Acrescente **Mostrar notificação** com o texto "Toque registado".

Notas:

- Com a automação, a tag pode continuar a ter o URL gravado — se a automação não correr (iPhone de outra pessoa), o link abre normalmente no Safari.
- A automação NFC só reage com o iPhone desbloqueado.

## 7. Onde colar

| Tarefa | Onde | Porquê |
| --- | --- | --- |
| Lixo (*até confirmar*) | Por dentro da **porta de casa**, à altura da mão, ou no caixote | Toca-se ao sair com o saco — confirma que foi despejado. |
| Máquina da roupa — tag **"inicia"** (*temporizador*) | **Lateral ou topo** da máquina, longe do painel e da porta (tag anti-metal!) | Toca-se ao carregar em "iniciar"; o Toque avisa quando acabar. Tocar outra vez enquanto decorre só mostra quanto falta. |
| Máquina da roupa — tag **"estendida"** | No **estendal** (ou no cesto da roupa) | Toca-se depois de estender: marca a roupa como tratada e pára os lembretes de "roupa esquecida". |
| Tarefas recorrentes | Junto ao objeto (filtro, plantas, caixa de areia…) | Toca-se ao terminar a tarefa. |

Dicas:

- Teste a leitura no sítio **antes** de colar definitivamente — paredes com tubos ou chapas metálicas também atrapalham.
- Limpe a superfície com álcool antes de colar.
- Uma pequena etiqueta ou ícone por cima ajuda as visitas a perceber para que serve.
- Evite sítios húmidos ou muito quentes (atrás da máquina, ao pé do forno).
