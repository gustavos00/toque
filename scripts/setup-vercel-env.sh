#!/usr/bin/env bash
# Stores Toque's production secrets in the linked Vercel project. Secrets are
# generated or typed here and piped straight to Vercel; nothing is written to
# disk or printed (except the cron header, shown once so you can copy it).
# Run from the project root after `npx vercel link`:
#
#   bash scripts/setup-vercel-env.sh            # password + app secrets
#   bash scripts/setup-vercel-env.sh --google   # Google Calendar (OAuth client + encryption key)
set -euo pipefail

ENVIRONMENT="production"

function add_env() {
  local name="$1" value="$2"
  npx vercel env rm "$name" "$ENVIRONMENT" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$name" "$ENVIRONMENT" >/dev/null
  echo "✓ $name"
}

function has_env() {
  npx vercel env ls "$ENVIRONMENT" 2>/dev/null | awk '{print $1}' | grep -qx "$1"
}

function trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  printf '%s' "${value%"${value##*[![:space:]]}"}"
}

function setup_app_secrets() {
  local password password_again cron_secret
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
}

function setup_google() {
  local client_id client_secret answer
  echo "Google Calendar — copia os valores do cliente OAuth (Google Cloud → APIs e serviços → Credenciais)."

  read -r -p "ID do cliente (…apps.googleusercontent.com): " client_id
  client_id="$(trim "$client_id")"
  if [[ "$client_id" != *.apps.googleusercontent.com ]]; then
    echo "Isto não parece um ID de cliente OAuth (deve terminar em .apps.googleusercontent.com)." >&2
    exit 1
  fi

  read -r -s -p "Segredo do cliente (não aparece no ecrã): " client_secret
  echo
  client_secret="$(trim "$client_secret")"
  if [[ -z "$client_secret" ]]; then
    echo "O segredo do cliente não pode ficar vazio." >&2
    exit 1
  fi

  add_env GOOGLE_CLIENT_ID "$client_id"
  add_env GOOGLE_CLIENT_SECRET "$client_secret"

  # The key encrypts the stored Google refresh token. A new key makes the
  # stored token unreadable, so an existing key is kept unless asked.
  if has_env TOQUE_ENCRYPTION_KEY; then
    read -r -p "Já existe TOQUE_ENCRYPTION_KEY. Gerar uma nova? Vais ter de voltar a ligar ao Google. [s/N] " answer
    if [[ "$answer" =~ ^[sS]$ ]]; then
      add_env TOQUE_ENCRYPTION_KEY "$(openssl rand -base64 32)"
    else
      echo "• TOQUE_ENCRYPTION_KEY mantida"
    fi
  else
    add_env TOQUE_ENCRYPTION_KEY "$(openssl rand -base64 32)"
  fi

  echo
  echo "Feito. Faz Redeploy no Vercel e depois, no Toque: Definições → Ligar ao Google."
}

case "${1:-}" in
  "") setup_app_secrets ;;
  --google) setup_google ;;
  *)
    echo "Uso: bash scripts/setup-vercel-env.sh [--google]" >&2
    exit 1
    ;;
esac
