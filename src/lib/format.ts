import type { EstadoPostulacion } from "./types";

const fechaFmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric" });
const fechaHoraFmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Las fechas "YYYY-MM-DD" se interpretan como fecha local (no UTC). */
function parse(d: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
}

export const fecha = (d?: string | null) => (d ? fechaFmt.format(parse(d)) : "—");
export const fechaHora = (d?: string | null) => (d ? fechaHoraFmt.format(parse(d)) : "—");

export function soles(n: number | string | null | undefined): string {
  return `S/ ${Number(n ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const solesCentimos = (c: number) => soles(c / 100);

export function hoyISO(offsetDias = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Días restantes hasta la fecha límite (incluye el día). null si no hay límite. */
export function diasRestantes(limite: string | null): number | null {
  if (!limite) return null;
  const hoy = parse(hoyISO());
  return Math.round((parse(limite).getTime() - hoy.getTime()) / 86400000);
}

export function textoCierre(limite: string | null): string {
  const d = diasRestantes(limite);
  if (d === null) return "Sin fecha de cierre";
  if (d < 0) return "Cerrada";
  if (d === 0) return "Cierra hoy";
  if (d === 1) return "Cierra mañana";
  return `Cierra en ${d} días`;
}

export function colorMatch(pct: number): string {
  if (pct >= 85) return "var(--ok)";
  if (pct >= 70) return "var(--warn)";
  if (pct > 0) return "var(--bad)";
  return "var(--muted)";
}

export const estadoLabel: Record<EstadoPostulacion, string> = {
  en_espera: "En espera",
  Apto: "Apto",
  "No Apto": "No apto",
};

export const CRITERIOS_SELLO: Record<string, { titulo: string; detalle: string }> = {
  publica_requisitos_verificables: {
    titulo: "Requisitos verificables",
    detalle: "Tus vacantes piden conocimientos y herramientas concretas, no rasgos vagos.",
  },
  acepta_postulacion_ciega: {
    titulo: "Postulación ciega",
    detalle: "La IA evalúa sin ver nombre, edad, sexo, foto ni datos de contacto.",
  },
  comunica_motivo_no_seleccion: {
    titulo: "Comunica el motivo de no selección",
    detalle: "Te comprometes a explicar el resultado y lo haces con al menos el 70 % de los no aptos.",
  },
  "tasa_respuesta_mayor_o_igual_70%": {
    titulo: "Responde al 70 % o más",
    detalle: "Al menos 7 de cada 10 postulantes reciben un correo con su resultado.",
  },
  sin_requisitos_discriminatorios: {
    titulo: "Sin requisitos discriminatorios",
    detalle: "Ninguna vacante pide edad, sexo, estado civil, apariencia u otros filtros injustos.",
  },
};

export function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function soloDigitos(v: string, max: number): string {
  return v.replace(/\D/g, "").slice(0, max);
}
