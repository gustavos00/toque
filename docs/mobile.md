# Instalar a app no iPhone

Passo a passo para instalar o Toque no teu iPhone com a equipa Apple da empresa, através do Xcode. Precisas de um Mac com Xcode e de um iPhone com NFC (XS ou mais recente), ligado por cabo.

## 0. Antes de tudo: publicar o servidor

A app fala com o servidor em produção (`https://toque-two.vercel.app`). As alterações do servidor (login com token, `/api/reminders`, `/api/scan`, `/.well-known`) têm de estar publicadas no Vercel antes de a app funcionar. Faz o deploy da branch e confirma que `https://toque-two.vercel.app/api/app-info` responde.

Para apontar a app para outro servidor, define `EXPO_PUBLIC_API_URL` antes de arrancar (por omissão usa o de produção).

## 1. Preparar o projeto

```bash
cd mobile
npm install
npx expo prebuild --platform ios
```

O `prebuild` cria a pasta `mobile/ios/`, que não vai para o git. Volta a corrê-lo sempre que mudares plugins, permissões ou `app.json`.

## 2. Xcode

1. Abre `mobile/ios/Toque.xcworkspace` (o `.xcworkspace`, não o `.xcodeproj`).
2. Seleciona o target **Toque** > **Signing & Capabilities**.
3. Em **Team**, escolhe a equipa da empresa. Mantém "Automatically manage signing".
4. Muda o **Bundle Identifier** para um que seja único nessa equipa, por exemplo `com.<empresa>.toque`. O `com.gustavo.toque` pode já estar tomado por outra equipa.
5. Confirma que aparecem as capabilities **Near Field Communication Tag Reading** e **Associated Domains** (com `applinks:toque-two.vercel.app`). Se alguma faltar, usa "+ Capability" para a juntar.
6. Escolhe o teu iPhone como destino e carrega em Run. No iPhone, se for preciso: Definições > Geral > VPN e gestão de dispositivos > confiar no programador. Se o iOS pedir, ativa o Modo de programador.

## 3. Fazer as etiquetas abrirem a app

Para o iPhone abrir a app ao tocar numa etiqueta (em vez do Safari), o servidor tem de dizer a que app o domínio pertence. No Vercel (Settings > Environment Variables, ambiente Production):

- `TOQUE_APPLE_TEAM_ID`: o identificador da equipa, 10 caracteres (developer.apple.com > Membership, ou Xcode > Team).
- `TOQUE_IOS_BUNDLE_ID`: só se mudaste o bundle id no passo 2.4.

Faz *Redeploy* e confirma que `https://toque-two.vercel.app/.well-known/apple-app-site-association` devolve JSON (até definires o team id devolve 404). Se mudaste o bundle id, atualiza também o `bundleIdentifier` no `mobile/app.json` e corre o `prebuild` outra vez. O iOS guarda este ficheiro em cache: se não funcionar logo, apaga a app, volta a instalar e espera uns minutos.

## 4. Gravar e ler uma etiqueta

1. Abre a app, entra com a palavra-passe.
2. No separador **Tags**, cria uma tag (ou usa uma existente), associa-a a uma tarefa e escolhe "Gravar / associar etiqueta NFC".
3. Encosta uma etiqueta NFC (NTAG213 serve) à parte de cima do iPhone e espera pela confirmação.
4. Fecha a app e toca na etiqueta outra vez: a app deve abrir e registar o toque. Confirma no Painel ou no Histórico.

## 5. Verificar os avisos

1. Ao abrir a app pela primeira vez, aceita as notificações.
2. Cria uma tarefa "Até confirmar" com uma hora daqui a poucos minutos, ou um temporizador curto, e lê a etiqueta.
3. Deve chegar o aviso no iPhone, com os botões "Feito" e "Adiar".
4. Os avisos são agendados localmente ao abrir a app e ao voltar a ela; abre-a de vez em quando para se atualizarem.
