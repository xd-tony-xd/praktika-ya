// POST { session_id } — Consulta el estado de una compra. Si sigue pendiente, pregunta a Stripe
// directamente (así la confirmación no depende solo del webhook).
import { serve, json, HttpError, readJson, str } from "../_shared/http.ts";
import { adminClient, requireEmpresa } from "../_shared/supabase.ts";
import { stripeRequest } from "../_shared/stripe.ts";

serve(async (req) => {
  const ctx = await requireEmpresa(req);
  const body = await readJson<{ session_id?: string }>(req);
  const sessionId = str(body.session_id, 200);
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new HttpError(400, "Sesión de pago no válida.");

  const admin = adminClient();
  const load = () =>
    admin.from("pagos_stripe").select("id,estado,paquete_nombre,creditos")
      .eq("session_id", sessionId).eq("empresa_id", ctx.empresa.id).maybeSingle();

  let { data: pago } = await load();
  if (!pago) throw new HttpError(404, "Compra no encontrada.");

  if (pago.estado === "pendiente") {
    try {
      // deno-lint-ignore no-explicit-any
      const s = await stripeRequest<any>("GET", `checkout/sessions/${encodeURIComponent(sessionId)}`);
      if (s?.payment_status === "paid" && Number(s?.metadata?.empresa_id) === ctx.empresa.id) {
        await admin.rpc("completar_pago", {
          p_session_id: sessionId,
          p_empresa_id: ctx.empresa.id,
          p_monto: Number(s.amount_total ?? 0),
          p_moneda: String(s.currency ?? ""),
          p_payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : null,
        });
      } else if (s?.status === "expired") {
        await admin.from("pagos_stripe").update({ estado: "fallido" })
          .eq("session_id", sessionId).eq("empresa_id", ctx.empresa.id).eq("estado", "pendiente");
      }
      ({ data: pago } = await load());
    } catch (e) {
      console.warn("checkout-status: no se pudo consultar Stripe", e);
    }
  }

  const { data: saldo } = await admin.from("creditos_empresa").select("saldo").eq("empresa_id", ctx.empresa.id).maybeSingle();
  return json({
    estado: pago!.estado,
    paquete: pago!.paquete_nombre,
    creditos: pago!.creditos,
    saldo: saldo?.saldo ?? 0,
  });
});
