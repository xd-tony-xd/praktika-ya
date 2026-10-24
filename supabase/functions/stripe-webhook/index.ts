// Webhook de Stripe. Configúralo en Stripe con la URL:
//   https://<proyecto>.supabase.co/functions/v1/stripe-webhook
// Eventos: checkout.session.completed, checkout.session.async_payment_succeeded,
//          checkout.session.async_payment_failed, checkout.session.expired
import { corsHeaders, env } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { verifyStripeSignature } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = env("STRIPE_WEBHOOK_SECRET");
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  if (!secret || !(await verifyStripeSignature(raw, signature, secret))) {
    return new Response("Invalid signature", { status: 400 });
  }

  // deno-lint-ignore no-explicit-any
  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("Bad payload", { status: 400 }); }
  const type: string = event?.type ?? "";
  const session = event?.data?.object ?? {};
  const admin = adminClient();

  try {
    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      if (session.payment_status === "paid" && session.id) {
        const { error } = await admin.rpc("completar_pago", {
          p_session_id: session.id,
          p_empresa_id: Number(session.metadata?.empresa_id ?? 0),
          p_monto: Number(session.amount_total ?? 0),
          p_moneda: String(session.currency ?? ""),
          p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
        });
        if (error) throw error;
      }
    } else if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") {
      if (session.id) {
        await admin.from("pagos_stripe").update({ estado: "fallido" }).eq("session_id", session.id).eq("estado", "pendiente");
      }
    }
  } catch (e) {
    console.error("stripe-webhook:", e);
    return new Response("Error", { status: 500 }); // Stripe reintentará
  }
  return new Response("ok", { status: 200 });
});
