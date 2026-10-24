// POST multipart/form-data — Postulación pública de un estudiante.
// Campos: vacante_id, dni, nombre_completo, celular, correo_estudiante, acepta_terminos=1,
//         cv (PDF ≤ 5 MB), voz (JSON opcional aprobado por el postulante), website (honeypot)
import { serve, json, HttpError, readForm, clientIp, str, isPdf } from "../_shared/http.ts";
import { adminClient, getConfig, rateLimit } from "../_shared/supabase.ts";

const MAX_CV = 5 * 1024 * 1024;

function lista(v: unknown, max = 15): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, max);
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  const form = await readForm(req);

  if (str(form.get("website"))) throw new HttpError(400, "Solicitud rechazada.");
  await rateLimit("postular", clientIp(req), 15, 60);

  const vacanteId = Number(form.get("vacante_id"));
  const dni = str(form.get("dni"));
  const nombre = str(form.get("nombre_completo"), 190);
  const celular = str(form.get("celular"));
  const correo = str(form.get("correo_estudiante"), 190).toLowerCase();
  const cv = form.get("cv");

  if (!Number.isInteger(vacanteId) || vacanteId <= 0) throw new HttpError(400, "Vacante inválida.");
  if (!/^[0-9]{8}$/.test(dni)) throw new HttpError(400, "El DNI debe tener exactamente 8 dígitos.");
  if (nombre.length < 3) throw new HttpError(400, "Ingresa tu nombre completo.");
  if (!/^[0-9]{9}$/.test(celular)) throw new HttpError(400, "El celular debe tener exactamente 9 dígitos numéricos.");
  if (form.get("acepta_terminos") !== "1") throw new HttpError(400, "Debes aceptar el tratamiento de datos para postular.");

  const cfg = await getConfig(["dominios_correo_estudiante"]);
  const dominios = (cfg.dominios_correo_estudiante || ".edu.pe")
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new HttpError(400, "El correo no es válido.");
  if (dominios.length && !dominios.some((d) => correo.endsWith(d))) {
    throw new HttpError(400, `Solo se permite postular con un correo institucional (${dominios.join(", ")}).`);
  }

  if (!(cv instanceof File)) throw new HttpError(400, "Adjunta tu CV en PDF.");
  if (cv.size > MAX_CV) throw new HttpError(400, "El CV supera el máximo de 5 MB.");
  const bytes = new Uint8Array(await cv.arrayBuffer());
  if (!isPdf(bytes)) throw new HttpError(400, "El archivo del CV debe ser un PDF válido.");

  const admin = adminClient();

  // La vacante debe existir, estar abierta, vigente y ser de una empresa aprobada
  const { data: vac } = await admin
    .from("vacantes_publicas")
    .select("id,vigente,titulo_puesto")
    .eq("id", vacanteId)
    .maybeSingle();
  if (!vac) throw new HttpError(404, "La convocatoria no existe.");
  if (!vac.vigente) throw new HttpError(409, "Esta convocatoria ya no recibe postulaciones.");

  const [porDni, porCorreo] = await Promise.all([
    admin.from("postulaciones").select("id").eq("vacante_id", vacanteId).eq("dni", dni).limit(1),
    admin.from("postulaciones").select("id").eq("vacante_id", vacanteId).eq("correo_estudiante", correo).limit(1),
  ]);
  if (porDni.data?.length || porCorreo.data?.length) {
    throw new HttpError(409, "Ya tienes una postulación registrada para esta vacante.");
  }

  // CV por voz aprobado por el postulante (el audio nunca se guarda)
  let voz: { transcripcion?: string; estudios?: unknown; experiencia?: unknown; habilidades?: unknown } | null = null;
  const vozRaw = str(form.get("voz"), 20000);
  if (vozRaw) {
    try { voz = JSON.parse(vozRaw); } catch { voz = null; }
  }

  const path = `${vacanteId}/${crypto.randomUUID()}.pdf`;
  const up = await admin.storage.from("cvs").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new HttpError(500, `No se pudo guardar el CV: ${up.error.message}`);

  const { data: row, error } = await admin
    .from("postulaciones")
    .insert({
      vacante_id: vacanteId,
      dni,
      nombre_completo: nombre,
      correo_estudiante: correo,
      celular,
      cv_path: path,
      voz_transcripcion: voz?.transcripcion ? String(voz.transcripcion).slice(0, 8000) : null,
      voz_estudios: voz ? lista(voz.estudios) : null,
      voz_experiencia: voz ? lista(voz.experiencia) : null,
      voz_habilidades: voz ? lista(voz.habilidades, 25) : null,
    })
    .select("id")
    .single();

  if (error) {
    await admin.storage.from("cvs").remove([path]);
    if (error.code === "23505") throw new HttpError(409, "Ya tienes una postulación registrada para esta vacante.");
    throw new HttpError(500, `No se pudo registrar la postulación: ${error.message}`);
  }

  return json({ ok: true, id: row.id, vacante: vac.titulo_puesto });
});
