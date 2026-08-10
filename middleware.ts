import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Session refresh and route protection.
 *
 * Two jobs. Supabase access tokens are short-lived, and only middleware can
 * write the refreshed cookie back on every request — a Server Component
 * cannot set cookies. And the signed-in area is gated here rather than in a
 * layout, so an unauthenticated request never reaches page code at all.
 *
 * Reads configuration directly rather than through lib/config/env.ts because
 * middleware runs on the Edge runtime, where that module's Node assumptions
 * do not hold. It is the one deliberate exception to the single-entry rule.
 */
const PROTECTED = ["/projects"];

export async function middleware(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  // Unconfigured: let everything through so the landing page works and the
  // product routes can render their "not configured" notice.
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Revalidates the token against the auth server and refreshes it if needed.
  const { data } = await supabase.auth.getUser();

  const isProtected = PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p));
  if (isProtected && !data.user) {
    const signIn = new URL("/sign-in", request.url);
    // So the user lands where they were headed once signed in.
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  // Everything except static assets and image files. The landing page is
  // included so its session cookie stays fresh, but it is never gated.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)"],
};
