import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookieMaxAge,
  verifyPassword,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!verifyPassword(password)) {
    // Custo fixo para não transformar a rota num oráculo de tempo.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ error: "senha incorreta" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await issueSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionCookieMaxAge(),
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
