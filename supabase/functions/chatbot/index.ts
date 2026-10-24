// POST { mensajes: [{ rol: "user"|"bot", texto }] } — Asistente virtual del sitio.
// Reemplaza el chatbot Python (chatbot-phyton.onrender.com). Conoce las vacantes abiertas.
import { serve, json, HttpError, readJson, clientIp, env } from "../_shared/http.ts";
import { adminClient, getConfig, rateLimit } from "../_shared/supabase.ts";
import { geminiText, type GeminiMessage } from "../_shared/gemini.ts";

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  await rateLimit("chatbot", clientIp(req), 40, 60);
  const body = await readJson<{ mensajes?: { rol?: string; texto?: string }[]; mensaje?: string }>(req);

  let entrada = Array.isArray(body.mensajes) ? body.mensajes : [];
  if (!entrada.length && typeof body.mensaje === "string") entrada = [{ rol: "user", texto: body.mensaje }];
  const historial: { rol: "user" | "bot"; texto: string }[] = entrada
    .filter((m) => typeof m?.texto === "string" && m.texto.trim())
    .slice(-12)
    .map((m) => ({ rol: m.rol === "bot" ? "bot" : "user", texto: String(m.texto).trim().slice(0, 1500) }));
  if (!historial.length || historial[historial.length - 1].rol !== "user") {
    throw new HttpError(400, "Escribe un mensaje.");
  }

  const admin = adminClient();
  const [cfg, { data: vacantes }] = await Promise.all([
    getConfig(["nombre_sitio", "email_contacto", "telefono_contacto", "dominios_correo_estudiante"]),
    admin.from("vacantes_publicas")
      .select("id,titulo_puesto,nombre_comercial,modalidad,ubicacion,fecha_limite,carreras")
      .eq("vigente", true)
      .order("fecha_publicacion", { ascending: false })
      .limit(30),
  ]);
  const site = cfg.nombre_sitio || "Práctika ya";
  const appUrl = env("APP_URL");
  // deno-lint-ignore no-explicit-any
  const listado = (vacantes ?? []).map((v: any) => {
    // deno-lint-ignore no-explicit-any
    const carreras = ((v.carreras as any[]) ?? []).map((c) => c.nombre).join(", ");
    return `- [${v.id}] ${v.titulo_puesto} · ${v.nombre_comercial} · ${v.modalidad}${v.ubicacion ? ` · ${v.ubicacion}` : ""}${carreras ? ` · Carreras: ${carreras}` : ""}${v.fecha_limite ? ` · Cierra: ${v.fecha_limite}` : ""} · Enlace: ${appUrl}/vacante/${v.id}`;
  }).join("\n");

  const system = `Eres el asistente virtual de "${site}", una plataforma peruana de convocatorias de prácticas preprofesionales.
Responde en español, con tono amable y cercano, en 1 a 5 oraciones (usa viñetas cortas solo si ayudan).
Datos de la plataforma:
- Los ESTUDIANTES no necesitan cuenta: eligen una vacante, pulsan "Postular", validan su DNI, usan su correo institucional (${cfg.dominios_correo_estudiante || ".edu.pe"}), celular de 9 dígitos y suben su CV en PDF (máx. 5 MB). Opcionalmente pueden grabar una "presentación por voz" de 60-90 s; el audio no se guarda y ellos aprueban lo extraído.
- Después pueden consultar su puntaje de compatibilidad en la página de la vacante ingresando su DNI.
- La IA compara el CV con los requisitos del puesto; las empresas pueden activar la "postulación ciega" (la IA ignora nombre, edad, sexo, foto y datos de contacto).
- Las EMPRESAS se registran con su RUC (activo y habido), ficha RUC, DNI del representante y una selfie; un administrador aprueba la cuenta y les llega un correo. Luego publican vacantes y compran créditos de IA (1 crédito = 1 CV analizado; si falla, se devuelve).
- El "Sello de transparencia" se otorga a empresas que publican requisitos verificables, aceptan postulación ciega, comunican el motivo de no selección, responden a ≥70 % de postulantes y no tienen requisitos discriminatorios.
- Contacto: ${cfg.email_contacto || "no indicado"}${cfg.telefono_contacto ? `, ${cfg.telefono_contacto}` : ""}.
Vacantes abiertas ahora (usa SOLO estas; si no hay coincidencias dilo y sugiere revisar más tarde):
${listado || "(no hay vacantes abiertas en este momento)"}
No inventes vacantes, sueldos ni datos. No pidas datos personales sensibles. Si preguntan algo ajeno a prácticas/empleo, redirige amablemente.`;

  const contents: GeminiMessage[] = historial.map((m) => ({
    role: m.rol === "bot" ? "model" : "user",
    parts: [{ text: m.texto }],
  }));
  while (contents.length && contents[0].role === "model") contents.shift(); // Gemini exige iniciar con "user"

  const { text } = await geminiText({ system, contents, temperature: 0.5, timeoutMs: 45_000 });
  return json({ respuesta: text.slice(0, 3000) });
});
