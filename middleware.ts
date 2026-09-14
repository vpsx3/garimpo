import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  authConfigured,
  isCronAuthorized,
  verifySessionToken,
} from "@/lib/auth/session";

/**
 * Uso pessoal, usuário único: nada é servido sem sessão válida.
 * Rotas de cron autenticam por `Authorization: Bearer $CRON_SECRET`.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/cron/")) {
    if (isCronAuthorized(request.headers.get("authorization"))) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  if (!authConfigured()) {
    // Fail closed: sem senha configurada a aplicação não serve nada.
    return NextResponse.json(
      {
        error: "APP_ACCESS_PASSWORD não configurada",
        detail:
          "A aplicação recusa requisições até que uma senha de acesso seja definida no ambiente.",
      },
      { status: 503 },
    );
  }

  const authenticated = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (pathname === "/login") {
    if (authenticated) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
