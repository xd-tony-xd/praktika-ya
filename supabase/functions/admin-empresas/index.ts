// POST { empresa_id, estado: "aprobado" | "bloqueado" | "pendiente" } — Solo administrador.
// Al aprobar por primera vez: envía correo de bienvenida y otorga créditos de bienvenida (si se configuraron).
import { serve, json, HttpError, readJson, env } from "../_shared/http.ts";
import { adminClient, getConfig, requireAdmin } from "../_shared/supabase.ts";
import { sendMail } from "../_shared/mail.ts";

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  await requireAdmin(req);
  const body = await readJson<{ empresa_id?: number; estado?: string }>(req);
  const empresaId = Number(body.empresa_id);
  const estado = String(body.estado ?? "");
  if (!Number.isInteger(empresaId) || empresaId <= 0) throw new HttpError(400, "ID de empresa inválido.");
  if (!["aprobado", "bloqueado", "pendiente"].includes(estado)) throw new HttpError(400, "Estado inválido.");

  const admin = adminClient();
  const { data: emp } = await admin
    .from("empresas")
    .select("id,nombre_comercial,correo_contacto,estado")
    .eq("id", empresaId)
    .maybeSingle();
  if (!emp) throw new HttpError(404, "Empresa no encontrada.");

  const { error } = await admin.from("empresas").update({ estado }).eq("id", empresaId);
  if (error) throw new HttpError(500, `No se pudo actualizar: ${error.message}`);

  let mailSent = false;
  let mailError: string | null = null;
  let bonus = 0;

  if (estado === "aprobado" && emp.estado !== "aprobado") {
    const cfg = await getConfig(["creditos_bienvenida", "nombre_sitio"]);
    bonus = Math.max(0, Math.floor(Number(cfg.creditos_bienvenida) || 0));
    if (bonus > 0) {
      await admin.rpc("bonificar_creditos", {
        p_empresa_id: empresaId,
        p_creditos: bonus,
        p_ref: `bienvenida:${empresaId}`,
        p_desc: "Créditos de bienvenida",
      });
    }
    const site = cfg.nombre_sitio || "Práctika ya";
    const appUrl = env("APP_URL");
    const res = await sendMail({
      to: emp.correo_contacto,
      toName: emp.nombre_comercial,
      subject: `¡Cuenta activada! - ${site}`,
      text:
        `Nos complace informarte que tu cuenta en ${site} ha sido revisada y APROBADA por nuestro equipo.\n\n` +
        `Ya puedes iniciar sesión y publicar tus convocatorias de prácticas.` +
        (bonus > 0 ? `\n\nTe regalamos ${bonus} créditos para analizar CV con inteligencia artificial.` : "") +
        (appUrl ? `\n\nIngresa aquí: ${appUrl}/login` : "") +
        `\n\n¡Bienvenido a bordo!\nEquipo ${site}`,
    });
    mailSent = res.ok;
    mailError = res.ok ? null : res.error ?? "No se pudo enviar el correo.";
  }

  return json({ success: true, nuevo_estado: estado, mail_sent: mailSent, mail_error: mailError, creditos_bienvenida: bonus });
});
