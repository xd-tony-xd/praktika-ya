// Sello de Transparencia (equivale a /sello/evaluar de la API Python, pero calculado con datos reales).
//  POST { accion: "evaluar" }                 -> evalúa a la empresa y registra el resultado (hash encadenado)
//  POST { accion: "revisar", texto, titulo? }  -> revisa con IA si unos requisitos son discriminatorios / verificables
// La consulta pública del sello se hace con el RPC consultar_sello(empresa_id).
import { serve, json, HttpError, readJson, str, sha256Hex, env } from "../_shared/http.ts";
import { adminClient, rateLimit, requireEmpresa } from "../_shared/supabase.ts";
import { geminiJson, PROMPT_REQUISITOS, REQUISITOS_SCHEMA } from "../_shared/gemini.ts";

interface RevisionVacante {
  id: string;
  discriminatorio: boolean;
  verificable: boolean;
  observaciones: string[];
  sugerencia?: string;
}

async function revisarRequisitos(vacs: { id: string | number; titulo: string; requisitos: string }[]): Promise<RevisionVacante[]> {
  if (!vacs.length) return [];
  const texto = vacs.map((v) => `### Vacante id=${v.id}\nPuesto: ${v.titulo}\nRequisitos:\n${v.requisitos}`).join("\n\n");
  const { data } = await geminiJson<{ vacantes: RevisionVacante[] }>({
    system: PROMPT_REQUISITOS,
    contents: [{ role: "user", parts: [{ text: texto }] }],
    schema: REQUISITOS_SCHEMA,
    temperature: 0,
  });
  return (data.vacantes ?? []).map((r) => ({
    id: String(r.id),
    discriminatorio: Boolean(r.discriminatorio),
    verificable: Boolean(r.verificable),
    observaciones: (r.observaciones ?? []).filter(Boolean).slice(0, 6),
    sugerencia: r.sugerencia ?? "",
  }));
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  const ctx = await requireEmpresa(req);
  const body = await readJson<{ accion?: string; texto?: string; titulo?: string }>(req);
  const admin = adminClient();
  const empresa = ctx.empresa;

  if (body.accion === "revisar") {
    const texto = str(body.texto, 6000);
    if (texto.length < 10) throw new HttpError(400, "Escribe los requisitos a revisar.");
    await rateLimit("sello:revisar", String(empresa.id), 40, 60);
    const [r] = await revisarRequisitos([{ id: "1", titulo: str(body.titulo, 190) || "Puesto", requisitos: texto }]);
    return json(r ?? { id: "1", discriminatorio: false, verificable: true, observaciones: [], sugerencia: "" });
  }

  if (body.accion !== "evaluar") throw new HttpError(400, "Acción inválida.");
  await rateLimit("sello:evaluar", String(empresa.id), 6, 60);

  // 1) Vacantes de los últimos 180 días
  const desde = new Date(Date.now() - 180 * 86400_000).toISOString();
  const { data: vacs } = await admin
    .from("vacantes")
    .select("id,titulo_puesto,requisitos_raw")
    .eq("empresa_id", empresa.id)
    .gte("fecha_publicacion", desde)
    .order("fecha_publicacion", { ascending: false })
    .limit(15);
  // deno-lint-ignore no-explicit-any
  const vacantes = (vacs ?? []).map((v: any) => ({ id: v.id, titulo: v.titulo_puesto, requisitos: v.requisitos_raw }));
  const revision = await revisarRequisitos(vacantes);

  // 2) Respuesta a postulantes
  const { data: posts } = await admin
    .from("postulaciones")
    .select("estado_postulacion,notificado_en,vacantes!inner(empresa_id)")
    .eq("vacantes.empresa_id", empresa.id)
    .limit(5000);
  // deno-lint-ignore no-explicit-any
  const lista: any[] = posts ?? [];
  const total = lista.length;
  const respondidas = lista.filter((p) => p.notificado_en).length;
  const noAptos = lista.filter((p) => p.estado_postulacion === "No Apto");
  const noAptosNotificados = noAptos.filter((p) => p.notificado_en).length;
  const tasa = total ? respondidas / total : 0;
  const tasaNoApto = noAptos.length ? noAptosNotificados / noAptos.length : 1;

  // 3) Criterios
  const criterios: Record<string, boolean> = {
    publica_requisitos_verificables: revision.length > 0 && revision.every((r) => r.verificable),
    acepta_postulacion_ciega: empresa.postulacion_ciega === true,
    comunica_motivo_no_seleccion: empresa.comunica_motivo_no_seleccion === true && tasaNoApto >= 0.7,
    "tasa_respuesta_mayor_o_igual_70%": total > 0 && tasa >= 0.7,
    sin_requisitos_discriminatorios: revision.length > 0 && revision.every((r) => !r.discriminatorio),
  };
  const cumplidos = Object.keys(criterios).filter((k) => criterios[k]);
  const pendientes = Object.keys(criterios).filter((k) => !criterios[k]);
  const otorgado = pendientes.length === 0;

  const detalle = {
    vacantes_revisadas: revision.map((r) => ({
      ...r,
      titulo: vacantes.find((v: { id: number }) => String(v.id) === r.id)?.titulo ?? "",
    })),
    postulaciones_total: total,
    postulaciones_respondidas: respondidas,
    tasa_respuesta: Math.round(tasa * 1000) / 1000,
    no_aptos_total: noAptos.length,
    no_aptos_notificados: noAptosNotificados,
  };

  // 4) Registro encadenado por hash
  const { data: prev } = await admin
    .from("sellos").select("huella").eq("empresa_id", empresa.id)
    .order("emitido_en", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  const emitidoEn = new Date().toISOString();
  const registro = {
    company_id: empresa.id,
    ruc: empresa.ruc,
    sello_otorgado: otorgado,
    criterios_cumplidos: cumplidos,
    criterios_pendientes: pendientes,
    detalle,
    emitido_en: emitidoEn,
    huella_anterior: prev?.huella ?? null,
  };
  const huella = await sha256Hex(JSON.stringify(registro));

  const { error } = await admin.from("sellos").insert({
    empresa_id: empresa.id,
    sello_otorgado: otorgado,
    criterios_cumplidos: cumplidos,
    criterios_pendientes: pendientes,
    detalle,
    huella,
    huella_anterior: prev?.huella ?? null,
    emitido_en: emitidoEn,
  });
  if (error) throw new HttpError(500, `No se pudo registrar el sello: ${error.message}`);

  return json({
    company_id: empresa.id,
    sello_otorgado: otorgado,
    criterios_cumplidos: cumplidos,
    criterios_pendientes: pendientes,
    detalle,
    ledger_url: `${env("APP_URL")}/sello/${empresa.id}`,
    emitido_en: emitidoEn,
    huella,
  });
});
