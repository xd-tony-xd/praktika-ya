// POST multipart { audio } — "CV por voz": el postulante graba 60-90 s presentándose.
// Equivale a POST /voz de la API de reclutamiento (Python).
// El audio se procesa en memoria y NO se guarda. El postulante revisa y aprueba
// los datos extraídos antes de enviarlos con su postulación.
import { serve, json, HttpError, readForm, clientIp, toBase64 } from "../_shared/http.ts";
import { rateLimit } from "../_shared/supabase.ts";
import { geminiJson, VOZ_SCHEMA } from "../_shared/gemini.ts";

const MAX_AUDIO = 10 * 1024 * 1024;
const MIME_OK = ["audio/wav", "audio/x-wav", "audio/wave", "audio/mp3", "audio/mpeg", "audio/aac", "audio/ogg", "audio/flac", "audio/aiff", "audio/webm", "audio/mp4", "audio/x-m4a"];

interface VozResult {
  transcripcion: string;
  estudios: string[];
  experiencia: string[];
  habilidades: string[];
}

function normalizarMime(file: File): string {
  const t = (file.type || "").split(";")[0].trim().toLowerCase();
  if (t) return t === "audio/x-wav" || t === "audio/wave" ? "audio/wav" : t === "audio/mpeg" ? "audio/mp3" : t;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ({ wav: "audio/wav", mp3: "audio/mp3", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4", webm: "audio/webm" } as Record<string, string>)[ext ?? ""] ?? "audio/wav";
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  await rateLimit("cv-voz", clientIp(req), 8, 60);

  const form = await readForm(req);
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) throw new HttpError(400, "Adjunta un audio de 60 a 90 segundos.");
  if (audio.size > MAX_AUDIO) throw new HttpError(400, "El audio es demasiado grande (máximo 10 MB).");
  const mime = normalizarMime(audio);
  if (!MIME_OK.includes(mime)) throw new HttpError(400, "Formato de audio no soportado. Usa WAV, MP3, OGG o FLAC.");

  let bytes: Uint8Array | null = new Uint8Array(await audio.arrayBuffer());
  const { data } = await geminiJson<VozResult>({
    system: `Eres un asistente de reclutamiento. Recibirás el audio de un estudiante que se presenta para una práctica.
1) Transcribe fielmente el audio en español ("transcripcion"), sin inventar nada.
2) Extrae listas breves: "estudios" (carrera, ciclo, institución, cursos), "experiencia" (trabajos, prácticas, proyectos), "habilidades" (técnicas y blandas).
No incluyas datos sensibles como DNI, dirección, edad o teléfono en las listas. Si algo no se menciona, deja la lista vacía.`,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: mime, data: toBase64(bytes) } },
        { text: "Transcribe y extrae la información del postulante." },
      ],
    }],
    schema: VOZ_SCHEMA,
    temperature: 0.1,
    timeoutMs: 120_000,
  });
  bytes = null; // el audio se descarta

  const limpiar = (a: unknown, max: number) =>
    (Array.isArray(a) ? a : []).filter((x) => typeof x === "string" && x.trim()).map((x: string) => x.trim().slice(0, 300)).slice(0, max);

  return json({
    transcripcion: String(data.transcripcion ?? "").trim().slice(0, 8000),
    estudios: limpiar(data.estudios, 15),
    experiencia: limpiar(data.experiencia, 15),
    habilidades: limpiar(data.habilidades, 25),
    audio_borrado: true,
    requiere_aprobacion_postulante: true,
  });
});
