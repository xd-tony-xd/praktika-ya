// Cliente mínimo de Google Gemini (REST). Reemplaza los servicios Python y n8n.
import { HttpError, env } from "./http.ts";

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

const DEFAULT_MODELS = "gemini-3.1-flash-lite,gemini-2.5-flash";

function models(): string[] {
  return (env("GEMINI_MODELS") || env("GEMINI_MODEL") || DEFAULT_MODELS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

interface CallOptions {
  contents: GeminiMessage[];
  system?: string;
  temperature?: number;
  schema?: Record<string, unknown>;
  timeoutMs?: number;
}

async function call(opts: CallOptions): Promise<{ text: string; model: string }> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new HttpError(503, "Falta configurar GEMINI_API_KEY en los secretos de Supabase.");

  const body: Record<string, unknown> = {
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  let lastError = "Sin respuesta del modelo";
  for (const model of models()) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
        },
      );
    } catch (e) {
      lastError = `No se pudo conectar con Gemini (${model}): ${(e as Error).message}`;
      continue;
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastError = `Gemini ${model} respondió HTTP ${res.status}: ${payload?.error?.message ?? "error"}`;
      console.warn(lastError);
      // 400 por clave inválida no se arregla cambiando de modelo
      if (res.status === 400 && /api key/i.test(payload?.error?.message ?? "")) break;
      continue; // 404 modelo inexistente, 429 cuota, 5xx: probamos el siguiente
    }
    const cand = payload?.candidates?.[0];
    const text = (cand?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();
    if (!text) {
      lastError = `Gemini ${model} no devolvió contenido (motivo: ${cand?.finishReason ?? payload?.promptFeedback?.blockReason ?? "desconocido"}).`;
      continue;
    }
    return { text, model };
  }
  throw new HttpError(502, lastError);
}

export async function geminiJson<T>(opts: CallOptions & { schema: Record<string, unknown> }): Promise<{ data: T; model: string }> {
  const { text, model } = await call(opts);
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return { data: JSON.parse(clean) as T, model };
  } catch {
    throw new HttpError(502, "La IA devolvió una respuesta con formato inválido. Intenta nuevamente.");
  }
}

export async function geminiText(opts: CallOptions): Promise<{ text: string; model: string }> {
  return await call(opts);
}

// ---------------------------------------------------------------------
//  Esquemas de respuesta (OpenAPI subset de Gemini)
// ---------------------------------------------------------------------
export const CV_SCHEMA = {
  type: "OBJECT",
  properties: {
    puntaje: { type: "INTEGER", description: "Compatibilidad 0-100 con los requisitos" },
    descripcion: { type: "STRING", description: "Justificación breve y profesional en español (máx. 900 caracteres)" },
    fortalezas: { type: "ARRAY", items: { type: "STRING" } },
    brechas: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["puntaje", "descripcion"],
};

export const VOZ_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcripcion: { type: "STRING" },
    estudios: { type: "ARRAY", items: { type: "STRING" } },
    experiencia: { type: "ARRAY", items: { type: "STRING" } },
    habilidades: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["transcripcion", "estudios", "experiencia", "habilidades"],
};

export const REQUISITOS_SCHEMA = {
  type: "OBJECT",
  properties: {
    vacantes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          discriminatorio: { type: "BOOLEAN" },
          verificable: { type: "BOOLEAN" },
          observaciones: { type: "ARRAY", items: { type: "STRING" } },
          sugerencia: { type: "STRING" },
        },
        required: ["id", "discriminatorio", "verificable", "observaciones"],
      },
    },
  },
  required: ["vacantes"],
};

export const PROMPT_REQUISITOS = `Eres auditor de procesos de reclutamiento justos en Perú.
Para cada vacante evalúa sus requisitos:
- "discriminatorio": true si exige o excluye por edad, sexo/género, estado civil, embarazo, apariencia física, talla/peso, religión, origen, raza, discapacidad no relacionada al puesto, lugar de residencia innecesario, o "buena presencia". Marca false si no hay nada de eso.
- "verificable": true si los requisitos son concretos y comprobables (conocimientos, herramientas, ciclo/carrera, idiomas con nivel, disponibilidad). false si son vagos ("proactivo", "ganas de aprender") sin nada medible.
- "observaciones": frases cortas que expliquen los problemas encontrados (vacío si no hay).
- "sugerencia": una versión mejorada y neutral de los requisitos si hubo problemas (vacío si no).
Responde solo con el JSON pedido, en español.`;
