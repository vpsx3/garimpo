import { NextResponse } from "next/server";
import { activeProviderName, env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: activeProviderName(),
    apifyConfigured: Boolean(env("APIFY_TOKEN") && env("APIFY_ACTOR_ID")),
    now: new Date().toISOString(),
  });
}
