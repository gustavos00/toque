#!/usr/bin/env bash
# Generates Toque's production secrets and stores them in the linked Vercel
# project. Secrets are created here and piped straight to Vercel; nothing is
# written to disk. Run from the project root after `vercel link`:
#   bash scripts/setup-vercel-env.sh
set -euo pipefail

ENVIRONMENT="production"

function add_env() {
  local name="$1" value="$2"
  npx vercel env rm "$name" "$ENVIRONMENT" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$name" "$ENVIRONMENT" >/dev/null
  echo "✓ $name"
}

read -r -s -p "Palavra-passe para entrar no Toque: " password
echo
read -r -s -p "Repete a palavra-passe: " password_again
echo
if [[ "$password" != "$password_again" || -z "$password" ]]; then
  echo "As palavras-passe não coincidem." >&2
  exit 1
fi

cron_secret="$(openssl rand -hex 32)"

add_env TOQUE_PASSWORD "$password"
add_env TOQUE_SESSION_SECRET "$(openssl rand -base64 48)"
add_env TOQUE_ACTION_SECRET "$(openssl rand -base64 48)"
add_env TOQUE_CRON_SECRET "$cron_secret"

echo
echo "Guarda este segredo para o cron-job.org (cabeçalho Authorization):"
echo "  Bearer $cron_secret"
echo
echo "Feito. O tópico do ntfy escolhe-se depois, nas Definições da app."
