import { env } from "@/lib/env";
import type { Sql } from "postgres";

/**
 * Notificação por e-mail via Resend. Opcional e atrás de env var: sem
 * `RESEND_API_KEY` o sistema segue funcionando, só não avisa por fora.
 */

export type AlertDigestRow = {
  kind: string;
  title: string | null;
  url: string | null;
  search_label: string;
  payload: Record<string, unknown> | null;
};

export async function sendAlertDigest(sql: Sql): Promise<boolean> {
  const apiKey = env("RESEND_API_KEY");
  const to = env("ALERT_EMAIL_TO");
  if (!apiKey || !to) return false;

  const alerts = await sql<AlertDigestRow[]>`
    select a.kind, l.title, l.url, s.label as search_label, a.payload
    from alerts a
    left join listings l on l.id = a.listing_id
    left join searches s on s.id = a.search_id
    where a.read_at is null and a.created_at >= now() - interval '1 day'
    order by a.created_at desc
    limit 40
  `;

  if (alerts.length === 0) return false;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: env("ALERT_EMAIL_FROM") ?? "Garimpo <onboarding@resend.dev>",
    to,
    subject: `Garimpo · ${alerts.length} ${alerts.length === 1 ? "alerta" : "alertas"}`,
    html: renderDigest(alerts),
  });

  return true;
}

function renderDigest(alerts: AlertDigestRow[]): string {
  const items = alerts
    .map((alert) => {
      const title = escapeHtml(alert.title ?? "Anúncio");
      const link = alert.url
        ? `<a href="${escapeHtml(alert.url)}">${title}</a>`
        : title;
      return `<li>${describe(alert)} — ${link} <small>(${escapeHtml(
        alert.search_label ?? "",
      )})</small></li>`;
    })
    .join("");

  return `<div style="font-family:system-ui,sans-serif;font-size:14px">
    <p>Novidades nas suas buscas rastreadas:</p>
    <ul>${items}</ul>
    <p style="color:#666;font-size:12px">
      Preços são diárias efetivas: já incluem limpeza, serviço e impostos
      diluídos pelas noites da estadia.
    </p>
  </div>`;
}

function describe(alert: AlertDigestRow): string {
  const payload = alert.payload ?? {};
  switch (alert.kind) {
    case "price_drop":
      return `<strong>Queda de ${payload.dropPct ?? "?"}%</strong>`;
    case "new_match":
      return `<strong>Novo match</strong> em "${escapeHtml(
        String(payload.filterSetLabel ?? "filtro salvo"),
      )}"`;
    case "became_unavailable":
      return "<strong>Ficou indisponível</strong>";
    default:
      return escapeHtml(alert.kind);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
