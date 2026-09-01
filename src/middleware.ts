import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

type CookieList = { name: string; value: string; options?: CookieOptions }[];

/**
 * Refreshes the Supabase session on every request and keeps everything except
 * the login page behind it. The app holds the farm's whole book, and the only
 * people who should see it are the three on the access list.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieList) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = isPublicPath(path);

  if (forwardsMagicLink(path, request.nextUrl.searchParams.has("code"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  if (!user && !isPublic) {
    // An API call must be told "no" in the language it speaks. Redirecting it
    // to the login page returns HTML with a 200, and the offline write queue
    // would read that as success and drop an entry the farm manager believes
    // he saved. That is the exact failure this app exists to prevent.
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Your session has expired. Open the app and sign in again." },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * Whether a request carrying ?code= is a stray magic link that needs rescuing.
 *
 * A magic link can arrive at the site root carrying its code, because Supabase
 * falls back to the project's Site URL whenever the requested redirect is not
 * on its allow list. Left alone, the login check below would bounce to /login
 * and throw the code away, and the person would see the sign-in form again with
 * no explanation.
 *
 * But "?code=" is not a Supabase invention. Google's OAuth returns one too, to
 * /api/drive/callback, and that route knows exactly what to do with it. Sending
 * it to Supabase's handler instead hands Google's authorization code to the
 * wrong exchange, which throws — and the person who just granted Drive access
 * lands on a server error with no idea what happened. An API route is always
 * answering its own round trip; only pages need this rescue.
 */
export function forwardsMagicLink(path: string, hasCode: boolean): boolean {
  if (!hasCode) return false;
  if (path.startsWith("/auth/")) return false;
  if (path.startsWith("/api/")) return false;
  return true;
}

/**
 * The pages anyone may read without signing in.
 *
 * Sign-in itself, and the two documents Google requires before it will publish
 * an external app. Google will not accept a privacy policy that sits behind a
 * login, and it is right not to: a policy nobody can read is not a policy.
 *
 * Everything else on this farm's books stays behind the door.
 */
export function isPublicPath(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path === "/privacy" ||
    path === "/terms"
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
