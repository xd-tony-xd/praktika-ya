// POST { paquete_id } — La empresa inicia la compra de un paquete de créditos IA (Stripe Checkout).
import { serve, json, HttpError, readJson } from "../_shared/http.ts";
import { adminClient, getConfig, requireEmpresa } from "../_shared/supabase.ts";
import { appUrl, stripeRequest } from "../_shared/stripe.ts";

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
  const ctx = await requireEmpresa(req);
  const body = await readJson<{ paquete_id?: number }>(req);

  const cfg = await getConfig(["ai_credit_sales_enabled", "nombre_sitio"]);
  if ((cfg.ai_credit_sales_enabled ?? "1") !== "1") throw new HttpError(403, "La venta de créditos está temporalmente desactivada.");

  const admin = adminClient();
  const { data: pkg } = await admin
    .from("paquetes_creditos")
    .select("*")
    .eq("id", Number(body.paquete_id))
    .eq("activo", true)
    .maybeSingle();
  if (!pkg) throw new HttpError(404, "Ese paquete no está disponible.");

  const base = appUrl();
  const amount = Math.round(Number(pkg.precio_total) * 100);
  if (amount < 100 || amount > 99_999_999) throw new HttpError(422, "El paquete debe costar entre S/ 1.00 y S/ 999,999.99.");
  const cost = Math.round(Number(pkg.costo_base) * Number(pkg.creditos) * 100);
  const site = cfg.nombre_sitio || "Práctika ya";

  const session = await stripeRequest<{ id: string; url: string }>("POST", "checkout/sessions", {
    mode: "payment",
    success_url: `${base}/empresa/creditos?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/empresa/creditos?checkout=cancelled`,
    customer_email: ctx.empresa.correo_contacto,
    client_reference_id: String(ctx.empresa.id),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "pen",
        unit_amount: amount,
        product_data: {
          name: `${pkg.nombre} · ${pkg.creditos} análisis IA`,
          description: `Créditos para analizar postulaciones en ${site}`,
        },
      },
    }],
    metadata: { empresa_id: String(ctx.empresa.id), creditos: String(pkg.creditos), paquete_id: String(pkg.id) },
  });
  if (!session?.id || !session?.url) throw new HttpError(502, "Stripe no devolvió una sesión de pago.");

  const { error } = await admin.from("pagos_stripe").insert({
    empresa_id: ctx.empresa.id,
    session_id: session.id,
    monto_centimos: amount,
    costo_estimado_centimos: cost,
    utilidad_estimada_centimos: Math.max(0, amount - cost),
    moneda: "PEN",
    creditos: pkg.creditos,
    paquete_nombre: pkg.nombre,
    estado: "pendiente",
  });
  if (error) throw new HttpError(500, `No se pudo registrar el pago: ${error.message}`);

  return json({ url: session.url });
});
