#!/usr/bin/env bash
# Despliega base de datos + Edge Functions + secretos en tu proyecto Supabase.
# Uso:  bash scripts/desplegar-backend.sh TU_PROJECT_REF
set -euo pipefail
REF="${1:-}"
if [ -z "$REF" ]; then echo "Uso: bash scripts/desplegar-backend.sh TU_PROJECT_REF"; exit 1; fi
if [ ! -f supabase/.env ]; then echo "Falta supabase/.env (copia supabase/.env.example y complétalo)"; exit 1; fi
npx supabase login
npx supabase link --project-ref "$REF"
npx supabase db push
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy
echo ""
echo "Listo. Ahora crea tu usuario administrador (ver README, paso 4)."
