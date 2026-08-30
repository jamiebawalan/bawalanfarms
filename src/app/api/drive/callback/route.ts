import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/drive/oauth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Google sends the owner back here with a code.
 *
 * The refresh token goes straight into the database and is never rendered, so
 * it does not pass through a screen, a clipboard, or a chat window on its way
 * to where it lives.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = (status: string) => NextResponse.redirect(new URL(`/settings?drive=${status}`, request.url));

  if (url.searchParams.get("error") !== null) return settings("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.headers.get("cookie")?.match(/drive_state=([a-f0-9]+)/)?.[1];
  if (code === null || state === null || expected === undefined || state !== expected) {
    return settings("badstate");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const tokens = await exchangeCode(code, url.origin);
    if (tokens.refreshToken === null) {
      // Google only returns a refresh token on a fresh consent. Without one the
      // connection would die in an hour, so it is better to say so now.
      return settings("norefresh");
    }
    const admin = createAdminClient();
    await admin.from("google_auth").upsert(
      {
        id: true,
        refresh_token: tokens.refreshToken,
        connected_by: user.email,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "id" },
    );
    const response = settings("connected");
    response.cookies.delete("drive_state");
    return response;
  } catch {
    return settings("failed");
  }
}
