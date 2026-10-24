# Práctika ya 2.0 — Supabase + React

Reescritura completa del sistema PHP + los servicios Python (API de reclutamiento y chatbot) en **una sola plataforma**:

| Antes | Ahora |
|---|---|
| PHP + MySQL (HostGator) | **React** (Vite) en Vercel/Netlify + **Supabase** (Postgres, Auth, Storage) |
| n8n / API Python `/cv` (Gemini) | Edge Function `analizar-cv` (Gemini directo) |
| API Python `/voz` | Edge Function `cv-voz` + grabadora en el formulario de postulación |
| API Python `/sello/evaluar` y `/sello/{id}` | Edge Function `sello` + página pública `/sello/:id` con huella SHA-256 encadenada |
| Chatbot Python (`chatbot-phyton.onrender.com`) | Edge Function `chatbot` (conoce las vacantes abiertas) |
| Cloudinary | Supabase Storage (CVs y documentos **privados**, logos públicos) |
| PHPMailer / Gmail 587 | Resend o Gmail SMTP 465 |
| Sesiones PHP | Supabase Auth + Row Level Security |

Ya no necesitas Render, n8n, Cloudinary ni hosting PHP.

---

## Despliegue (≈ 20 minutos)

### Requisitos
- Node.js 18 o superior
- Cuenta en [supabase.com](https://supabase.com) y en [vercel.com](https://vercel.com) (o Netlify)
- API key de Gemini: [aistudio.google.com](https://aistudio.google.com) → *Get API key*

### 1. Crear el proyecto Supabase
1. En Supabase: **New project** (región São Paulo es la más cercana a Perú).
2. Copia el **Project ref** (Settings → General) y, en Settings → API, la **Project URL** y la **anon / publishable key**.
3. En **Authentication → Sign In / Providers**, desactiva *Allow new users to sign up* (las empresas se registran por el formulario propio, que crea la cuenta desde el servidor).
4. En **Authentication → URL Configuration** pon tu dominio en *Site URL* y agrega `https://tu-dominio/restablecer` en *Redirect URLs* (para "Olvidé mi contraseña").

### 2. Configurar secretos
```bash
npm install
cp supabase/.env.example supabase/.env      # en Windows: copy supabase\.env.example supabase\.env
```
Completa `supabase/.env`. Mínimo: `GEMINI_API_KEY` y `APP_URL`. Para correo, `RESEND_API_KEY` **o** `SMTP_USER`/`SMTP_PASS`. El token de apiperu.dev que tenías como `INTI_API_KEY` va en `APIPERU_TOKEN`.

### 3. Subir base de datos + funciones
```bash
# Linux / Mac
bash scripts/desplegar-backend.sh TU_PROJECT_REF
# Windows
powershell -ExecutionPolicy Bypass -File scripts\desplegar-backend.ps1 TU_PROJECT_REF
```
Esto crea las tablas, seguridad, buckets de archivos, datos iniciales (carreras, paquetes, configuración), sube los secretos y despliega las 12 Edge Functions.

> Sin terminal: puedes pegar los 4 archivos de `supabase/migrations/` en orden en el **SQL Editor**, pero las funciones sí requieren el CLI.

### 4. Crear el administrador
1. Supabase → **Authentication → Users → Add user** (marca *Auto Confirm User*).
2. SQL Editor:
```sql
select public.hacer_admin('tu-correo@dominio.com');
```

### 5. Publicar el frontend en Vercel
1. Sube esta carpeta a un repositorio de GitHub e impórtalo en Vercel (detecta Vite solo).
2. En *Environment Variables*:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key
3. Deploy. Si tu dominio final cambia, actualiza `APP_URL` en los secretos (`npm run secrets:set`).

Netlify también funciona: build `npm run build`, carpeta `dist` (el archivo `public/_redirects` ya está incluido).

### 6. Stripe (opcional, para vender créditos IA)
1. Stripe → Developers → API keys → copia la *Secret key* a `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → *Add endpoint*: `https://TU_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
   con los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
3. Copia el *Signing secret* a `STRIPE_WEBHOOK_SECRET` y ejecuta `npm run secrets:set`.

---

## Desarrollo local
```bash
cp .env.example .env     # pon tu URL y anon key
npm run dev              # http://localhost:5173
npm run typecheck        # revisión de tipos
```

## Qué hace cada pieza

**Público:** listado de vacantes con filtros, detalle, postulación (DNI validado con RENIEC, correo `.edu.pe`, CV PDF ≤ 5 MB, presentación por voz opcional), consulta del resultado por DNI, registro de empresa (RUC verificado en SUNAT, ficha RUC, DNI, selfie con cámara), página pública del sello, chatbot.

**Empresa:** resumen, vacantes (crear/editar/cerrar/reabrir/eliminar/exportar, revisión de requisitos con IA), postulantes (análisis individual o masivo con barra de progreso, perfil con evaluación de la IA y datos de voz, cambio de estado, correos individuales y masivos con plantillas, exportar a Excel), créditos IA con Stripe, sello de transparencia, perfil. Notificaciones en vivo de nuevas postulaciones.

**Admin:** resumen, empresas (aprobar con correo de bienvenida y créditos de regalo, bloquear, expediente con documentos privados, correo, exportar), vacantes de toda la plataforma, postulantes por vacante (solo lectura), carreras, paquetes IA y ventas, configuración (marca, redes, mantenimiento, dominios de correo, puntaje mínimo para "apto", textos legales), perfil.

### Reglas importantes
- **1 crédito = 1 CV analizado.** La reserva es atómica en la base de datos; si la IA falla, el crédito se devuelve solo.
- **Postulación ciega** (activa por defecto): la IA recibe la instrucción de ignorar nombre, edad, sexo, foto y datos de contacto, y además se borran correos/teléfonos/DNI de su respuesta.
- **Sello de transparencia:** se calcula con datos reales (requisitos revisados por IA, tasa de respuesta ≥ 70 %, motivo comunicado a no aptos, postulación ciega). Vigente 90 días. Cada evaluación queda en un registro inmutable con hash SHA-256 que incluye el hash anterior.
- Los endpoints públicos (postular, voz, chatbot, DNI/RUC, registro) tienen límite de uso por IP.
- Las URLs antiguas del PHP (`/dashboard`, `/vacancies`, `/postulations`, `/register-company`…) redirigen a las nuevas.

## Estructura
```
src/                       Frontend React
  pages/publico|empresa|admin
  components/              UI, layouts, chatbot, cámara, grabadora de voz
  lib/                     cliente Supabase, router, auth, formatos
supabase/
  migrations/              esquema, funciones/RPC, seguridad (RLS + storage), datos iniciales
  functions/               12 Edge Functions (Deno) + _shared
scripts/                   despliegue del backend
```

## Migrar datos del sistema anterior
Las tablas conservan los mismos nombres de columnas que en MySQL (`empresas`, `vacantes`, `postulaciones`, `carreras`…), así que puedes exportar desde phpMyAdmin a CSV e importar en Supabase (Table Editor → Import). Ten en cuenta que:
- Las empresas necesitan una cuenta en Authentication; la forma más simple es que se registren de nuevo o crearlas en *Add user* y llenar `empresas.user_id`.
- Los CVs que estaban en Cloudinary se pueden dejar con su URL completa en `cv_path`: el panel abre URLs `https://` directamente (el análisis IA solo funciona con CVs subidos al bucket `cvs`).
