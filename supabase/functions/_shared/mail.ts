// Envío de correos. Usa Resend si RESEND_API_KEY está configurado;
// si no, SMTP (p. ej. Gmail con contraseña de aplicación por el puerto 465).
// Nota: Supabase bloquea los puertos 25 y 587, por eso SMTP usa 465 (SSL).
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { env } from "./http.ts";

export interface MailInput {
  to: string;
  toName?: string;
  subject: string;
  text: string;
}

export interface MailResult {
  ok: boolean;
  error?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function plantillaHtml(subject: string, text: string, toName = ""): string {
  const site = env("SITE_NAME", "Práctika ya");
  const appUrl = env("APP_URL");
  const body = escapeHtml(text).replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#f1f5fb;font-family:Arial,Helvetica,sans-serif;color:#172b4d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e3e9f3">
    <tr><td style="background:#2563eb;padding:20px 28px;color:#fff;font-size:20px;font-weight:bold">${escapeHtml(site)}</td></tr>
    <tr><td style="padding:28px">
      <h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(subject)}</h1>
      ${toName ? `<p style="margin:0 0 12px">Hola ${escapeHtml(toName)},</p>` : ""}
      <p style="margin:0;line-height:1.6;font-size:15px">${body}</p>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px">
      Este mensaje fue enviado desde ${escapeHtml(site)}${appUrl ? ` · <a href="${escapeHtml(appUrl)}" style="color:#2563eb">${escapeHtml(appUrl)}</a>` : ""}
    </td></tr>
  </table></td></tr></table></body></html>`;
}

export function correoConfigurado(): boolean {
  return Boolean(env("RESEND_API_KEY") || (env("SMTP_USER") && env("SMTP_PASS")));
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) return { ok: false, error: "El correo destinatario no es válido." };
  const html = plantillaHtml(input.subject, input.text, input.toName);
  const site = env("SITE_NAME", "Práctika ya");

  const resendKey = env("RESEND_API_KEY");
  if (resendKey) {
    const from = env("MAIL_FROM", `${site} <onboarding@resend.dev>`);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [input.to], subject: input.subject, html, text: input.text }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: `Resend: ${err?.message ?? res.status}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `No se pudo contactar a Resend: ${(e as Error).message}` };
    }
  }

  const user = env("SMTP_USER");
  // Las contraseñas de aplicación de Google se muestran con espacios: se quitan.
  const pass = env("SMTP_PASS").replace(/\s+/g, "");
  if (!user || !pass) {
    return { ok: false, error: "El correo no está configurado. Define RESEND_API_KEY o SMTP_USER/SMTP_PASS en los secretos." };
  }
  const client = new SMTPClient({
    connection: {
      hostname: env("SMTP_HOST", "smtp.gmail.com"),
      port: Number(env("SMTP_PORT", "465")),
      tls: true,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({
      from: env("MAIL_FROM", `${site} <${user}>`),
      to: input.toName ? `${input.toName} <${input.to}>` : input.to,
      subject: input.subject,
      content: input.text,
      html,
    });
    return { ok: true };
  } catch (e) {
    const msg = String((e as Error).message ?? e).toLowerCase();
    if (msg.includes("auth") || msg.includes("username")) {
      return { ok: false, error: "El servidor SMTP rechazó la autenticación. Para Gmail usa una contraseña de aplicación de 16 caracteres." };
    }
    return { ok: false, error: `No se pudo enviar el correo por SMTP: ${(e as Error).message}` };
  } finally {
    try { await client.close(); } catch { /* ignorar */ }
  }
}
