import { NextResponse } from "next/server";
import { limitedFetch } from "@/lib/providers/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Geocoding via Nominatim (OpenStreetMap).
 *
 * A política de uso pede no máximo 1 req/s e um User-Agent identificável. Sem
 * banco, o cache vive na memória da instância — some a cada cold start, mas
 * evita repetir a mesma consulta dentro de uma sessão de uso, que é onde o
 * usuário de fato repete endereços.
 */
const cache = new Map<string, { lat: number; lng: number; displayName: string | null } | null>();

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3) {
    return NextResponse.json({ error: "query_too_short" }, { status: 422 });
  }

  const key = query.toLowerCase();
  if (cache.has(key)) {
    const cached = cache.get(key);
    return cached
      ? NextResponse.json({ ...cached, cached: true })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  try {
    const response = await limitedFetch(url.toString(), {
      limiter: "nominatim",
      headers: {
        "user-agent": "Garimpo/1.0 (ferramenta pessoal de busca de acomodações)",
        accept: "application/json",
      },
      timeoutMs: 15_000,
      attempts: 2,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "geocode_failed", detail: `Nominatim respondeu ${response.status}.` },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      lat?: string;
      lon?: string;
      display_name?: string;
    }[];

    const first = payload?.[0];
    const lat = first?.lat ? Number(first.lat) : NaN;
    const lng = first?.lon ? Number(first.lon) : NaN;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      // Consulta sem resultado também é cacheada: repetir o que já falhou
      // gastaria a cota de quem hospeda o serviço de graça.
      cache.set(key, null);
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const result = { lat, lng, displayName: first?.display_name ?? null };
    cache.set(key, result);
    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    return NextResponse.json(
      {
        error: "geocode_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
