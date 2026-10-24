// Integración mínima con Stripe vía REST (sin SDK).
import { HttpError, env } from "./http.ts";

/** Convierte un objeto anidado al formato form-urlencoded de Stripe (a[b][0][c]=x). */
export function formEncode(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") out.push(...formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      out.push(...formEncode(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export async function stripeRequest<T = Record<string, unknown>>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const secret = env("STRIPE_SECRET_KEY");
  if (!secret) throw new HttpError(503, "El administrador aún no configuró Stripe.");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" && params ? formEncode(params).join("&") : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Stripe: ${data?.error?.message ?? `HTTP ${res.status}`}`);
  return data as T;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifica el encabezado Stripe-Signature (t=...,v1=...) con tolerancia de 5 minutos. */
export async function verifyStripeSignature(payload: string, header: string, secret: string, toleranceSec = 300): Promise<boolean> {
  const parts: Record<string, string[]> = {};
  for (const item of header.split(",")) {
    const [k, v] = item.split("=", 2);
    if (k && v) (parts[k.trim()] ??= []).push(v.trim());
  }
  const t = Number(parts.t?.[0] ?? 0);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return (parts.v1 ?? []).some((v) => timingSafeEqual(v, expected));
}

export function appUrl(): string {
  const url = env("APP_URL").replace(/\/+$/, "");
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    throw new HttpError(503, "Configura APP_URL (https://tu-dominio) en los secretos de Supabase.");
  }
  return url;
}
