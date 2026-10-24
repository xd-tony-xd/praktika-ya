# Despliega base de datos + Edge Functions + secretos en tu proyecto Supabase (Windows PowerShell).
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\desplegar-backend.ps1 TU_PROJECT_REF
param([Parameter(Mandatory = $true)][string]$Ref)
$ErrorActionPreference = "Stop"
if (-not (Test-Path "supabase/.env")) { Write-Error "Falta supabase/.env (copia supabase/.env.example y complétalo)"; exit 1 }
npx supabase login
npx supabase link --project-ref $Ref
npx supabase db push
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy
Write-Host ""
Write-Host "Listo. Ahora crea tu usuario administrador (ver README, paso 4)."
