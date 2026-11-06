import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public liveness probe; does not expose config or spend model/chain credits. */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
