"use client";

/** Cliente HTTP fino para as rotas internas. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { detail?: string; error?: string }).detail ??
        (payload as { error?: string }).error ??
        `Falha na requisição (${response.status}).`,
    );
  }
  return payload as T;
}

export async function sendJson<T>(
  url: string,
  method: "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { detail?: string; error?: string }).detail ??
        `Falha na requisição (${response.status}).`,
    );
  }
  return payload as T;
}
