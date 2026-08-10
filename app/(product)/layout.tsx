import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { capabilities } from "@/lib/config/env";
import { getSession } from "@/lib/services";

/** Gate for the signed-in area.
 *
 * The logic is the real one, not a placeholder: if auth is configured and
 * there is no session, redirect to sign-in. It is only when auth is *not*
 * configured that the children render, so the unconfigured notice is
 * reachable and the routes can be developed. Wiring an adapter turns this into
 * a genuine gate with no code change.
 */
export default async function ProductLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session && capabilities().auth) redirect("/sign-in");
  return <>{children}</>;
}
