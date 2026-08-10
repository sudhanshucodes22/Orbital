import { NextResponse } from "next/server";
import { capabilities } from "@/lib/config/env";

/** Deployment health and capability report.
 *
 * Returns booleans only — never a configuration value — so it is safe to leave
 * reachable. `ok` reflects the process being up, not the product being
 * complete, which is why an unconfigured capability does not fail the check.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "orbital",
    time: new Date().toISOString(),
    capabilities: capabilities(),
  });
}
