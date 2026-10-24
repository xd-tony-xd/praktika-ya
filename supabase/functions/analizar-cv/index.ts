// POST { postulacion_id } — La empresa analiza un CV con IA (1 crédito).
// Equivale a POST /cv de la API de reclutamiento (Python) + /api/analizar-cv del PHP.
// El análisis masivo se hace desde el frontend llamando a esta función por cada postulante
// (así hay barra de progreso real y no se excede el tiempo máximo de la función).
import { serve, json, HttpError, readJson, toBase64 } from "../_shared/http.ts";
import { adminClient, getConfig, requireEmpresa } from "../_shared/supabase.ts";
import { geminiJson, CV_SCHEMA } from "../_shared/gemini.ts";

interface CvResult {
  puntaje: number;
  descripcion: string;
  fortalezas?: string[];
  brechas?: string[];
}

const PROMPT_BASE = `Eres un reclutador experto en prácticas preprofesionales en Perú.
Evalúa qué tan compatible es el CV adjunto (PDF) con los requisitos del puesto.
Reglas:
- "puntaje": entero de 0 a 100. 85+ cumple casi todo; 60-84 cumple lo esencial; <60 no cumple lo esencial.
- Valora conocimientos, herramientas, proyectos académicos, ciclo/carrera y experiencia relevante.
- Para practicantes, los proyectos académicos y cursos cuentan como experiencia.
- "descripcion": 3 a 6 oraciones en español, profesionales y respetuosas, explicando el puntaje.
- "fortalezas" y "brechas": hasta 5 frases cortas cada una.
- Si el PDF no es un CV o no se puede leer, devuelve puntaje 0 y explícalo en la descripción.`;

const PROMPT_CIEGA = `
POSTULACIÓN CIEGA (obligatorio): ignora por completo nombre, sexo/género, edad o fecha de nacimiento,
fotografía, estado civil, nacionalidad, dirección, DNI, teléfono, correo y redes sociales.
No los uses para puntuar y NO los menciones en ninguna parte de la respuesta. Refiérete a la persona como "el/la postulante".`;

/** Quita datos de contacto que la IA pudiera haber copiado (defensa adicional en modo ciego). */
function anonimizar(texto: string): string {
  return texto
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo]")
    .replace(/(?:\+?51[\s-]?)?\b9\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, "[teléfono]")
    .replace(/\b\d{8}\b/g, "[documento]");
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  const ctx = await requireEmpresa(req);
  const body = await readJson<{ postulacion_id?: number }>(req);
  const postulacionId = Number(body.postulacion_id);
  if (!Number.isInteger(postulacionId) || postulacionId <= 0) throw new HttpError(400, "ID de postulación inválido.");

  const admin = adminClient();
  const empresaId = ctx.empresa.id;

  const { data: post } = await admin
    .from("postulaciones")
    .select("id, cv_path, voz_transcripcion, voz_estudios, voz_experiencia, voz_habilidades, vacantes!inner(id, empresa_id, titulo_puesto, requisitos_raw, descripcion_puesto)")
    .eq("id", postulacionId)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const vac = (post as any)?.vacantes;
  if (!post || !vac || vac.empresa_id !== empresaId) throw new HttpError(404, "Postulación no encontrada.");
  if (!post.cv_path) throw new HttpError(400, "La postulación no tiene CV adjunto.");

  // 1) Reservar crédito de forma atómica
  const { data: ref, error: refErr } = await admin.rpc("reservar_credito", {
    p_empresa_id: empresaId,
    p_postulacion_id: postulacionId,
  });
  if (refErr) throw new HttpError(500, `No se pudo reservar el crédito: ${refErr.message}`);
  if (ref === "EN_CURSO") throw new HttpError(409, "Este CV ya se está analizando. Espera unos segundos.");
  if (!ref) {
    const { data: saldo } = await admin.from("creditos_empresa").select("saldo").eq("empresa_id", empresaId).maybeSingle();
    throw new HttpError(402, "No tienes créditos de IA disponibles. Compra un paquete para continuar.", {
      sin_creditos: true,
      saldo: saldo?.saldo ?? 0,
    });
  }

  const reembolsar = async () => {
    await admin.rpc("reembolsar_credito", { p_ref: ref });
  };

  try {
    // 2) Descargar el CV del bucket privado
    const dl = await admin.storage.from("cvs").download(post.cv_path);
    if (dl.error || !dl.data) throw new HttpError(500, "No se pudo leer el CV almacenado.");
    const pdf = new Uint8Array(await dl.data.arrayBuffer());

    const ciega = ctx.empresa.postulacion_ciega !== false;
    let contexto = `PUESTO: ${vac.titulo_puesto}\n\nREQUISITOS DEL PUESTO:\n${vac.requisitos_raw}\n\nDESCRIPCIÓN DEL PUESTO:\n${vac.descripcion_puesto ?? ""}`;
    if (post.voz_transcripcion) {
      contexto += `\n\nPRESENTACIÓN POR VOZ (aprobada por el postulante):\nEstudios: ${(post.voz_estudios ?? []).join("; ")}\nExperiencia: ${(post.voz_experiencia ?? []).join("; ")}\nHabilidades: ${(post.voz_habilidades ?? []).join("; ")}`;
    }

    // 3) Analizar con Gemini
    const { data, model } = await geminiJson<CvResult>({
      system: PROMPT_BASE + (ciega ? PROMPT_CIEGA : ""),
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: toBase64(pdf) } },
          { text: contexto },
        ],
      }],
      schema: CV_SCHEMA,
      temperature: 0.1,
    });

    let puntaje = Number(data.puntaje);
    if (!Number.isFinite(puntaje)) throw new HttpError(502, "La IA no devolvió un puntaje numérico.");
    if (puntaje > 0 && puntaje <= 1) puntaje *= 100;
    puntaje = Math.max(0, Math.min(100, Math.round(puntaje)));

    let descripcion = String(data.descripcion ?? "Análisis completado.").trim();
    const fort = (data.fortalezas ?? []).filter(Boolean).slice(0, 5);
    const brech = (data.brechas ?? []).filter(Boolean).slice(0, 5);
    if (fort.length) descripcion += `\n\nFortalezas: ${fort.join("; ")}.`;
    if (brech.length) descripcion += `\nPor reforzar: ${brech.join("; ")}.`;
    if (ciega) descripcion = anonimizar(descripcion);
    descripcion = descripcion.slice(0, 3000);

    const cfg = await getConfig(["umbral_apto"]);
    const umbral = Number(cfg.umbral_apto) || 60;
    const estado = puntaje >= umbral ? "Apto" : "No Apto";

    // 4) Guardar resultado y consumir el crédito
    const { error: updErr } = await admin
      .from("postulaciones")
      .update({
        match_porcentaje: puntaje,
        ia_analisis_descripcion: descripcion,
        estado_postulacion: estado,
        ia_modelo: model,
        analizado_en: new Date().toISOString(),
      })
      .eq("id", postulacionId);
    if (updErr) throw new HttpError(500, "No se pudo guardar el análisis.");

    await admin.rpc("consumir_credito", { p_ref: ref });

    const { data: saldo } = await admin.from("creditos_empresa").select("saldo").eq("empresa_id", empresaId).maybeSingle();
    return json({
      success: true,
      puntaje,
      descripcion,
      estado,
      postulacion_ciega: ciega,
      modelo: model,
      saldo: saldo?.saldo ?? 0,
    });
  } catch (err) {
    await reembolsar();
    if (err instanceof HttpError) {
      throw new HttpError(err.status, `${err.message} El crédito fue devuelto.`, err.extra);
    }
    throw new HttpError(500, "Falló el análisis. El crédito fue devuelto.");
  }
});
