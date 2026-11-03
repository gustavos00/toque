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
  read -r -s -p "Password to sign in to Toque: " password
  echo
  read -r -s -p "Repeat the password: " password_again
  echo
  if [[ "$password" != "$password_again" || -z "$password" ]]; then
    echo "The passwords do not match." >&2
    exit 1
  fi

  cron_secret="$(openssl rand -hex 32)"

  add_env TOQUE_PASSWORD "$password"
  add_env TOQUE_SESSION_SECRET "$(openssl rand -base64 48)"
  add_env TOQUE_ACTION_SECRET "$(openssl rand -base64 48)"
  add_env TOQUE_CRON_SECRET "$cron_secret"

  echo
  echo "Save this secret for cron-job.org (Authorization header):"
  echo "  Bearer $cron_secret"
  echo
  echo "Done. The ntfy topic is chosen later, in the app Settings."
}

function setup_google() {
  local client_id client_secret answer
  echo "Google Calendar — copy the OAuth client values (Google Cloud → APIs & Services → Credentials)."

  read -r -p "Client ID (…apps.googleusercontent.com): " client_id
  client_id="$(trim "$client_id")"
  if [[ "$client_id" != *.apps.googleusercontent.com ]]; then
    echo "This does not look like an OAuth client ID (it must end in .apps.googleusercontent.com)." >&2
    exit 1
  fi

  read -r -s -p "Client secret (not shown on screen): " client_secret
  echo
  client_secret="$(trim "$client_secret")"
  if [[ -z "$client_secret" ]]; then
    echo "The client secret cannot be empty." >&2
    exit 1
  fi

  add_env GOOGLE_CLIENT_ID "$client_id"
  add_env GOOGLE_CLIENT_SECRET "$client_secret"

  # The key encrypts the stored Google refresh token. A new key makes the
  # stored token unreadable, so an existing key is kept unless asked.
  if has_env TOQUE_ENCRYPTION_KEY; then
    read -r -p "TOQUE_ENCRYPTION_KEY already exists. Generate a new one? You will have to connect to Google again. [y/N] " answer
    if [[ "$answer" =~ ^[yY]$ ]]; then
      add_env TOQUE_ENCRYPTION_KEY "$(openssl rand -base64 32)"
    else
      echo "• TOQUE_ENCRYPTION_KEY kept"
    fi
  else
    add_env TOQUE_ENCRYPTION_KEY "$(openssl rand -base64 32)"
  fi

  echo
  echo "Done. Redeploy on Vercel, then in Toque: Settings → Connect to Google."
}

case "${1:-}" in
  "") setup_app_secrets ;;
  --google) setup_google ;;
  *)
    echo "Usage: bash scripts/setup-vercel-env.sh [--google]" >&2
    exit 1
    ;;
esac
