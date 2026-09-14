import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { activeProviderName } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Checagem de saúde. Existe porque a conectividade com o pooler do Supabase só
 * pode ser verificada de dentro da Vercel — nunca do ambiente de build.
 */
export async function GET() {
  const checks: Record<string, unknown> = {
    provider: activeProviderName(),
    now: new Date().toISOString(),
  };

  try {
    const sql = await getSql();
    const [row] = await sql<{ tables: number; postgis: string | null }[]>`
      select
        (select count(*)::int from information_schema.tables
          where table_schema = 'public') as tables,
        (select extversion from pg_extension where extname = 'postgis') as postgis
    `;
    checks.database = "ok";
    checks.tables = row?.tables ?? 0;
    checks.postgis = row?.postgis ?? null;
  } catch (error) {
    checks.database = "error";
    checks.databaseError =
      error instanceof Error ? error.message : String(error);
    return NextResponse.json(checks, { status: 503 });
  }

  return NextResponse.json(checks);
}
