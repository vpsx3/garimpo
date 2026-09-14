import { env } from "@/lib/env";

/**
 * Portão de acesso da aplicação.
 *
 * O plano era depender exclusivamente do Vercel Authentication (Etapa 0 da
 * spec). Como a criação do projeto na Vercel não foi autorizada nesta sessão,
 * a aplicação carrega a própria trava: sem `APP_ACCESS_PASSWORD` configurada
 * nada é servido (fail closed). Quando o Vercel Authentication for ligado, as
 * duas camadas se somam — esta não substitui aquela.
 *
 * Tudo aqui usa Web Crypto, não `node:crypto`, porque o middleware roda no
 * runtime Edge.
 */

export const SESSION_COOKIE = "garimpo_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string | undefined {
  return env("APP_ACCESS_PASSWORD");
}

export function authConfigured(): boolean {
  return secret() !== undefined;
}

async function hmac(payload: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(payload),
  );
  return base64url(new Uint8Array(signature));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Comparação em tempo constante. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueSessionToken(): Promise<string> {
  const key = secret();
  if (!key) throw new Error("APP_ACCESS_PASSWORD não configurada.");
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  return `${expiresAt}.${await hmac(expiresAt, key)}`;
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  const key = secret();
  if (!key || !token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  return safeEqual(signature, await hmac(expiresAt, key));
}

export function verifyPassword(candidate: string): boolean {
  const key = secret();
  if (!key) return false;
  return safeEqual(candidate, key);
}

export function sessionCookieMaxAge(): number {
  return Math.floor(SESSION_TTL_MS / 1000);
}

export function isCronAuthorized(header: string | null): boolean {
  const expected = env("CRON_SECRET");
  if (!expected || !header) return false;
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  return safeEqual(token, expected);
}
