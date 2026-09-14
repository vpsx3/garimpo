import { getSql } from "@/lib/db/client";
import { limitedFetch } from "@/lib/providers/http";

/**
 * Geocoding via Nominatim (OpenStreetMap).
 *
 * A política de uso do serviço exige no máximo 1 req/s e um User-Agent
 * identificável. O cache em banco não é otimização: é o que mantém o uso
 * dentro da política — nenhum endereço é consultado duas vezes.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const LIMITER = "nominatim";

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string | null;
  cached: boolean;
};

export async function geocode(query: string): Promise<GeocodeResult | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  const sql = await getSql();

  const [cached] = await sql<
    { lat: number | null; lng: number | null; display_name: string | null }[]
  >`select lat, lng, display_name from geocode_cache where query = ${normalized}`;

  if (cached) {
    // Consulta sem resultado também é cacheada: repetir o que já falhou
    // gastaria a cota de quem hospeda o Nominatim de graça.
    if (cached.lat === null || cached.lng === null) return null;
    return {
      lat: cached.lat,
      lng: cached.lng,
      displayName: cached.display_name,
      cached: true,
    };
  }

  const url = new URL(NOMINATIM);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  const response = await limitedFetch(url.toString(), {
    limiter: LIMITER,
    headers: {
      "user-agent": "Garimpo/1.0 (ferramenta pessoal de busca de acomodações)",
      accept: "application/json",
    },
    timeoutMs: 15_000,
    attempts: 2,
  });

  if (!response.ok) {
    throw new Error(`Nominatim respondeu ${response.status}.`);
  }

  const payload = (await response.json()) as {
    lat?: string;
    lon?: string;
    display_name?: string;
  }[];

  const first = payload?.[0];
  const lat = first?.lat ? Number(first.lat) : null;
  const lng = first?.lon ? Number(first.lon) : null;
  const found = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  await sql`
    insert into geocode_cache (query, lat, lng, display_name, raw)
    values (
      ${normalized}, ${found ? lat : null}, ${found ? lng : null},
      ${first?.display_name ?? null}, ${sql.json((first ?? null) as never)}
    )
    on conflict (query) do update set
      lat = excluded.lat, lng = excluded.lng,
      display_name = excluded.display_name, raw = excluded.raw
  `;

  if (!found) return null;
  return {
    lat: lat!,
    lng: lng!,
    displayName: first?.display_name ?? null,
    cached: false,
  };
}
