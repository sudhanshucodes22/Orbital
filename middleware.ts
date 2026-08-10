import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Session refresh and route protection.
 *
 * Reads process.env directly rather than going through lib/config/env.ts
 * because middleware runs on the Edge runtime, where that module's Node
 * assumptions do not hold. It is the one deliberate exception to the
 * single-entry rule.
 *
 * This is a fast redirect, not the security boundary. Pages call getSession()
 * themselves and redirect when it returns null, so a forged cookie that slips
 * past the presence check here still reaches nothing.
 */
const PROTECTED = ["/projects"];
const DEMO_COOKIE = "orbital_demo_session";

function isProtected(pathname: string) {
  return PROTECTED.some((p) => pathname.startsWith(p));
}

function toSignIn(request: NextRequest) {
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export async function middleware(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  // ---- demo mode -----------------------------------------------------------
  // No Supabase to refresh against. Presence of the signed cookie is enough to
  // decide whether to redirect; the signature is verified server-side by
  // getSession(), which is what actually gates the data.
  if (!url || !anonKey) {
    if (isProtected(request.nextUrl.pathname) && !request.cookies.get(DEMO_COOKIE)) {
      return toSignIn(request);
    }
    return NextResponse.next();
  }

  // ---- supabase ------------------------------------------------------------
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
  // Only middleware can write the refreshed cookie back; a Server Component
  // cannot set cookies.
  const { data } = await supabase.auth.getUser();

  if (isProtected(request.nextUrl.pathname) && !data.user) return toSignIn(request);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
