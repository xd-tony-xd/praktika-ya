// POST — Envío de correos.
//  Empresa:  { tipo: "postulante", postulacion_ids: number[], asunto, mensaje }   (individual o masivo)
//  Admin:    { tipo: "empresa", empresa_id, asunto, mensaje }
import { serve, json, HttpError, readJson, str } from "../_shared/http.ts";
import { adminClient, getAuth } from "../_shared/supabase.ts";
import { sendMail } from "../_shared/mail.ts";

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  const ctx = await getAuth(req);
  if (!ctx) throw new HttpError(401, "Inicia sesión para continuar.");

  const body = await readJson<{ tipo?: string; postulacion_ids?: unknown; empresa_id?: number; asunto?: string; mensaje?: string }>(req);
  const asunto = str(body.asunto, 200);
  const mensaje = str(body.mensaje, 8000);
  if (!asunto || !mensaje) throw new HttpError(400, "Completa el asunto y el mensaje.");
  const admin = adminClient();

  if (body.tipo === "empresa") {
    if (ctx.rol !== "admin") throw new HttpError(403, "Solo el administrador puede escribir a empresas.");
    const { data: emp } = await admin.from("empresas").select("correo_contacto,nombre_comercial").eq("id", Number(body.empresa_id)).maybeSingle();
    if (!emp) throw new HttpError(404, "Empresa no encontrada.");
    const r = await sendMail({ to: emp.correo_contacto, toName: emp.nombre_comercial, subject: asunto, text: mensaje });
    if (!r.ok) throw new HttpError(502, r.error ?? "No se pudo enviar el correo.");
    return json({ success: true, enviados: 1, fallidos: 0 });
  }

  if (body.tipo !== "postulante") throw new HttpError(400, "Tipo de correo inválido.");
  if (!ctx.empresa || ctx.empresa.estado !== "aprobado") throw new HttpError(403, "Solo empresas aprobadas pueden notificar postulantes.");

  const ids = (Array.isArray(body.postulacion_ids) ? body.postulacion_ids : [])
    .map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const unicos = [...new Set(ids)].slice(0, 200);
  if (!unicos.length) throw new HttpError(400, "Selecciona al menos un postulante.");

  const { data: posts } = await admin
    .from("postulaciones")
    .select("id, correo_estudiante, nombre_completo, estado_postulacion, vacantes!inner(empresa_id, titulo_puesto)")
    .in("id", unicos);

  // deno-lint-ignore no-explicit-any
  const propias = (posts ?? []).filter((p: any) => p.vacantes?.empresa_id === ctx.empresa!.id);
  if (!propias.length) throw new HttpError(404, "No se encontraron postulaciones válidas.");

  let enviados = 0;
  const errores: string[] = [];
  for (const p of propias) {
    if (p.estado_postulacion === "en_espera") {
      errores.push(`${p.nombre_completo}: primero analiza su CV con IA.`);
      continue;
    }
    // deno-lint-ignore no-explicit-any
    const puesto = (p as any).vacantes?.titulo_puesto ?? "";
    const texto = mensaje.replaceAll("{nombre}", p.nombre_completo).replaceAll("{puesto}", puesto);
    const r = await sendMail({ to: p.correo_estudiante, toName: p.nombre_completo, subject: asunto, text: texto });
    if (r.ok) {
      enviados++;
      await admin.from("postulaciones").update({ notificado_en: new Date().toISOString() }).eq("id", p.id);
    } else {
      errores.push(`${p.nombre_completo}: ${r.error}`);
      if (/no está configurado/i.test(r.error ?? "")) break;
    }
  }

  if (!enviados && errores.length) throw new HttpError(502, errores[0], { errores });
  return json({ success: true, enviados, fallidos: errores.length, errores });
});
