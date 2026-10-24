// GET/POST  { tipo: "dni" | "ruc", numero }
// Consulta pública (con límite por IP) a RENIEC/SUNAT. Reemplaza /api/dni y /api/consultar-ruc.
import { serve, json, HttpError, readJson, clientIp, str } from "../_shared/http.ts";
import { rateLimit } from "../_shared/supabase.ts";
import { consultarDocumento } from "../_shared/apiperu.ts";

serve(async (req) => {
  let tipo = "";
  let numero = "";
  if (req.method === "GET") {
    const url = new URL(req.url);
    tipo = url.searchParams.get("tipo") ?? "";
    numero = url.searchParams.get("numero") ?? "";
  } else {
    const body = await readJson(req);
    tipo = str(body.tipo);
    numero = str(body.numero);
  }
  if (tipo !== "dni" && tipo !== "ruc") throw new HttpError(400, "Tipo de documento inválido.");
  const largo = tipo === "dni" ? 8 : 11;
  if (!new RegExp(`^[0-9]{${largo}}$`).test(numero)) {
    throw new HttpError(400, `El ${tipo.toUpperCase()} debe tener ${largo} dígitos.`);
  }
  await rateLimit(`doc:${tipo}`, clientIp(req), 30, 60);
  const result = await consultarDocumento(tipo, numero);
  return json(result, 200);
});
