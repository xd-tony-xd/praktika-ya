// POST multipart — Registro público de empresa (queda "pendiente" hasta que el admin la apruebe).
// Campos: ruc, nombre_comercial, sector, correo_contacto, telefono, direccion, password,
//         password_confirm, accept_terms=1, website_url (honeypot)
// Archivos: foto_perfil (logo), ficha_ruc (PDF), dni_frente, dni_reverso, foto_selfie
import { serve, json, HttpError, readForm, clientIp, str, isPdf, isImage, imageExt } from "../_shared/http.ts";
import { adminClient, rateLimit } from "../_shared/supabase.ts";
import { apiPeruConfigurada, consultarDocumento } from "../_shared/apiperu.ts";

const MAX_IMG = 3 * 1024 * 1024;
const MAX_DOC = 8 * 1024 * 1024;

async function leerArchivo(form: FormData, campo: string, etiqueta: string, opts: { pdf?: boolean; img?: boolean; max: number }) {
  const f = form.get(campo);
  if (!(f instanceof File) || f.size === 0) throw new HttpError(400, `Falta adjuntar: ${etiqueta}.`);
  if (f.size > opts.max) throw new HttpError(400, `${etiqueta} supera el tamaño máximo permitido.`);
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (opts.pdf && isPdf(bytes)) return { bytes, ext: "pdf", mime: "application/pdf" };
  if (opts.img && isImage(bytes)) return { bytes, ...imageExt(bytes) };
  throw new HttpError(400, `${etiqueta}: formato no válido (${opts.pdf && opts.img ? "imagen o PDF" : opts.pdf ? "PDF" : "imagen"}).`);
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  const form = await readForm(req);
  if (str(form.get("website_url"))) throw new HttpError(400, "Solicitud rechazada.");
  await rateLimit("registro", clientIp(req), 6, 60);

  const ruc = str(form.get("ruc"));
  const nombre = str(form.get("nombre_comercial"), 180);
  const sector = str(form.get("sector"), 120) || "GENERAL";
  const correo = str(form.get("correo_contacto"), 190).toLowerCase();
  const telefono = str(form.get("telefono"));
  const direccion = str(form.get("direccion"), 255);
  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  const confirm = typeof form.get("password_confirm") === "string" ? String(form.get("password_confirm")) : "";

  if (!/^[0-9]{11}$/.test(ruc)) throw new HttpError(400, "El RUC debe tener 11 dígitos.");
  if (nombre.length < 2) throw new HttpError(400, "Ingresa el nombre comercial.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new HttpError(400, "El correo de contacto no es válido.");
  if (!/^[0-9]{9}$/.test(telefono)) throw new HttpError(400, "El teléfono debe tener exactamente 9 dígitos.");
  if (password.length < 8) throw new HttpError(400, "La contraseña debe tener al menos 8 caracteres.");
  if (password !== confirm) throw new HttpError(400, "Las contraseñas no coinciden.");
  if (form.get("accept_terms") !== "1") throw new HttpError(400, "Debes aceptar los términos y condiciones.");

  const admin = adminClient();

  const [{ data: rucDup }, { data: mailDup }] = await Promise.all([
    admin.from("empresas").select("id").eq("ruc", ruc).maybeSingle(),
    admin.from("empresas").select("id").eq("correo_contacto", correo).maybeSingle(),
  ]);
  if (rucDup) throw new HttpError(409, "Ya existe una empresa registrada con ese RUC.");
  if (mailDup) throw new HttpError(409, "Ese correo ya está registrado.");

  // Verificación del RUC en SUNAT (si la API está configurada)
  let rucVerificado = false;
  if (apiPeruConfigurada()) {
    const r = await consultarDocumento("ruc", ruc);
    if (!r.success) throw new HttpError(400, "No pudimos verificar el RUC en SUNAT. Revisa el número.");
    if (r.data.estado.toUpperCase() !== "ACTIVO" || r.data.condicion.toUpperCase() !== "HABIDO") {
      throw new HttpError(400, "El RUC debe estar ACTIVO y HABIDO en SUNAT para registrarse.");
    }
    rucVerificado = true;
  }

  const logo = await leerArchivo(form, "foto_perfil", "Logo de la empresa", { img: true, max: MAX_IMG });
  const ficha = await leerArchivo(form, "ficha_ruc", "Ficha RUC", { pdf: true, max: MAX_DOC });
  const dniF = await leerArchivo(form, "dni_frente", "DNI (frente)", { pdf: true, img: true, max: MAX_DOC });
  const dniR = await leerArchivo(form, "dni_reverso", "DNI (reverso)", { pdf: true, img: true, max: MAX_DOC });
  const selfie = await leerArchivo(form, "foto_selfie", "Selfie de verificación", { img: true, max: MAX_DOC });

  // Crear usuario de acceso (confirmado: el control lo hace el administrador)
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
    user_metadata: { nombre },
    app_metadata: { rol: "empresa" },
  });
  if (userErr || !created?.user) {
    const msg = /already|registered|exists/i.test(userErr?.message ?? "") ? "Ese correo ya tiene una cuenta." : `No se pudo crear la cuenta: ${userErr?.message}`;
    throw new HttpError(409, msg);
  }
  const uid = created.user.id;
  const subidos: { bucket: string; path: string }[] = [];

  const subir = async (bucket: string, path: string, f: { bytes: Uint8Array; mime: string }) => {
    const { error } = await admin.storage.from(bucket).upload(path, f.bytes, { contentType: f.mime, upsert: true });
    if (error) throw new HttpError(500, `No se pudo subir un archivo: ${error.message}`);
    subidos.push({ bucket, path });
    return path;
  };

  try {
    const logoPath = await subir("publico", `${uid}/logo_${Date.now()}.${logo.ext}`, logo);
    const logoUrl = admin.storage.from("publico").getPublicUrl(logoPath).data.publicUrl;
    const fichaPath = await subir("documentos", `${uid}/ficha_ruc.pdf`, ficha);
    const dniFPath = await subir("documentos", `${uid}/dni_frente.${dniF.ext}`, dniF);
    const dniRPath = await subir("documentos", `${uid}/dni_reverso.${dniR.ext}`, dniR);
    const selfiePath = await subir("documentos", `${uid}/selfie.${selfie.ext}`, selfie);

    const { error: insErr } = await admin.from("empresas").insert({
      user_id: uid,
      nombre_comercial: nombre,
      ruc,
      sector,
      correo_contacto: correo,
      telefono,
      direccion,
      foto_perfil: logoUrl,
      ficha_ruc: fichaPath,
      dni_frente: dniFPath,
      dni_reverso: dniRPath,
      foto_selfie: selfiePath,
      ruc_verificado: rucVerificado,
      estado: "pendiente",
    });
    if (insErr) throw new HttpError(500, `No se pudo registrar la empresa: ${insErr.message}`);
  } catch (err) {
    // Deshacer: archivos y usuario
    for (const s of subidos) await admin.storage.from(s.bucket).remove([s.path]);
    await admin.auth.admin.deleteUser(uid);
    throw err;
  }

  return json({ ok: true, ruc_verificado: rucVerificado });
});
