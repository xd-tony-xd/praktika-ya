// Consulta RUC (SUNAT) y DNI (RENIEC) mediante apiperu.dev u otro proveedor compatible.
import { env } from "./http.ts";

export interface DocumentoData {
  nombre_completo: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  razon_social: string;
  nombre_comercial: string;
  direccion: string;
  sector: string;
  estado: string;
  condicion: string;
}

export type DocumentoResult = { success: true; data: DocumentoData } | { success: false; error: string; no_configurado?: boolean };

export function apiPeruConfigurada(): boolean {
  return Boolean(env("APIPERU_TOKEN") || env("INTI_API_KEY"));
}

export async function consultarDocumento(tipo: "ruc" | "dni", numero: string): Promise<DocumentoResult> {
  const token = env("APIPERU_TOKEN") || env("INTI_API_KEY");
  if (!token) return { success: false, error: "La consulta automática no está configurada.", no_configurado: true };
  const base = (env("APIPERU_URL") || env("INTI_BASE_URL") || "https://apiperu.dev/api").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/${tipo}/${numero}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      return { success: false, error: json?.message ?? `No se encontró el ${tipo.toUpperCase()} (HTTP ${res.status}).` };
    }
    const raw = json.data ?? {};
    const nombres = raw.nombres ?? "";
    const ap = raw.apellido_paterno ?? "";
    const am = raw.apellido_materno ?? "";
    const razon = raw.nombre_o_razon_social ?? raw.razon_social ?? "";
    let sector = raw.actividad_economica ?? "GENERAL";
    if (Array.isArray(sector)) sector = sector[0] ?? "GENERAL";
    const nombreCompleto = `${nombres} ${ap} ${am}`.replace(/\s+/g, " ").trim() || raw.nombre_completo || razon;
    return {
      success: true,
      data: {
        nombre_completo: nombreCompleto,
        nombres,
        apellido_paterno: ap,
        apellido_materno: am,
        razon_social: razon,
        nombre_comercial: razon,
        direccion: raw.direccion_completa ?? raw.direccion ?? "",
        sector: String(sector || "GENERAL"),
        estado: raw.estado ?? "",
        condicion: raw.condicion ?? "",
      },
    };
  } catch (e) {
    return { success: false, error: `No se pudo consultar el servicio: ${(e as Error).message}` };
  }
}
