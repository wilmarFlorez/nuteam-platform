#!/usr/bin/env bash
set -euo pipefail

api_url=""
anon_key=""
db_url=""
while IFS= read -r line; do
  case "$line" in
    DB_URL=*)
      db_url="${line#DB_URL=\"}"
      db_url="${db_url%\"}"
      ;;
    API_URL=*)
      api_url="${line#API_URL=\"}"
      api_url="${api_url%\"}"
      ;;
    ANON_KEY=*)
      anon_key="${line#ANON_KEY=\"}"
      anon_key="${anon_key%\"}"
      ;;
  esac
done < <(pnpm exec supabase status -o env 2>/dev/null)

if [[ -z "$api_url" || -z "$anon_key" || -z "$db_url" ]]; then
  printf '%s\n' "Supabase local is not running. Run: pnpm exec supabase start"
  exit 1
fi

SUPABASE_TEST_URL="$api_url" SUPABASE_TEST_ANON_KEY="$anon_key" SUPABASE_TEST_DB_URL="$db_url" \
  uv run --directory apps/api pytest tests/integration "$@"
