import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(SUPABASE_URL || "http://localhost:54321", SUPABASE_ANON_KEY || "falta-configurar", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** Llama a una Edge Function. Acepta JSON o FormData. Lanza ApiError con el mensaje del servidor. */
export async function callFn<T = Record<string, unknown>>(name: string, body?: Record<string, unknown> | FormData): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "POST", headers, body: payload });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión.", 0);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(json.error ?? `Error ${res.status}`), res.status, json);
  return json as T;
}

/** URL firmada (temporal) para archivos privados: CVs y documentos. */
export async function urlFirmada(bucket: "cvs" | "documentos", path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

/** Sube una imagen al bucket público dentro de la carpeta del usuario y devuelve la URL pública. */
export async function subirImagenPublica(carpeta: string, nombre: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${carpeta}/${nombre}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("publico").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new ApiError(`No se pudo subir la imagen: ${error.message}`, 400);
  return supabase.storage.from("publico").getPublicUrl(path).data.publicUrl;
}

export function errorMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Ocurrió un error inesperado.";
}
