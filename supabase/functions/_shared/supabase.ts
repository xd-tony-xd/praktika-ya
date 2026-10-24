import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { HttpError, env } from "./http.ts";

let _admin: SupabaseClient | null = null;

/** Cliente con service_role (salta RLS). Solo se usa dentro de Edge Functions. */
export function adminClient(): SupabaseClient {
  if (_admin) return _admin;
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY");
  if (!url || !key) throw new HttpError(503, "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en la función.");
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export interface Empresa {
  id: number;
  user_id: string;
  nombre_comercial: string;
  ruc: string;
  correo_contacto: string;
  estado: string;
  postulacion_ciega: boolean;
  comunica_motivo_no_seleccion: boolean;
}

export interface AuthContext {
  userId: string;
  email: string;
  rol: "admin" | "empresa";
  empresa: Empresa | null;
}

/** Valida el JWT del usuario que llama y devuelve su rol y empresa. */
export async function getAuth(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const user = data.user;
  const { data: perfil } = await admin.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
  const rol = perfil?.rol === "admin" ? "admin" : "empresa";
  let empresa: Empresa | null = null;
  if (rol === "empresa") {
    const { data: emp } = await admin
      .from("empresas")
      .select("id,user_id,nombre_comercial,ruc,correo_contacto,estado,postulacion_ciega,comunica_motivo_no_seleccion")
      .eq("user_id", user.id)
      .maybeSingle();
    empresa = (emp as Empresa) ?? null;
  }
  return { userId: user.id, email: user.email ?? "", rol, empresa };
}

export async function requireAdmin(req: Request): Promise<AuthContext> {
  const ctx = await getAuth(req);
  if (!ctx) throw new HttpError(401, "Inicia sesión para continuar.");
  if (ctx.rol !== "admin") throw new HttpError(403, "Solo un administrador puede realizar esta acción.");
  return ctx;
}

export async function requireEmpresa(req: Request): Promise<AuthContext & { empresa: Empresa }> {
  const ctx = await getAuth(req);
  if (!ctx) throw new HttpError(401, "Inicia sesión para continuar.");
  if (!ctx.empresa) throw new HttpError(403, "Esta acción es solo para cuentas de empresa.");
  if (ctx.empresa.estado !== "aprobado") throw new HttpError(403, "Tu cuenta de empresa aún no está aprobada.");
  return ctx as AuthContext & { empresa: Empresa };
}

/** Lee varias claves de configuración de una vez. */
export async function getConfig(keys: string[]): Promise<Record<string, string>> {
  const { data } = await adminClient().from("configuracion").select("clave,valor").in("clave", keys);
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.clave] = row.valor ?? "";
  return out;
}

/**
 * Límite simple de uso por IP para endpoints públicos (evita abuso y costos de IA/API).
 * Lanza 429 si se supera `max` llamadas en `windowMin` minutos.
 */
export async function rateLimit(accion: string, clave: string, max: number, windowMin = 60): Promise<void> {
  const admin = adminClient();
  const since = new Date(Date.now() - windowMin * 60_000).toISOString();
  const { count } = await admin
    .from("uso_publico")
    .select("id", { count: "exact", head: true })
    .eq("accion", accion)
    .eq("clave", clave)
    .gte("creado_en", since);
  if ((count ?? 0) >= max) {
    throw new HttpError(429, "Has realizado demasiadas solicitudes. Espera unos minutos e inténtalo otra vez.");
  }
  await admin.from("uso_publico").insert({ accion, clave });
  // Limpieza oportunista de registros viejos (1 de cada 50 llamadas)
  if (Math.random() < 0.02) {
    await admin.from("uso_publico").delete().lt("creado_en", new Date(Date.now() - 2 * 86400_000).toISOString());
  }
}
