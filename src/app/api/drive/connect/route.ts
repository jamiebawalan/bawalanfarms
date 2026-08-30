import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { consentUrl, isConfigured } from "@/lib/drive/oauth";
import { createClient } from "@/lib/supabase/server";

/** Sends the owner to Google to say yes. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!isConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?drive=unconfigured", request.url),
    );
  }

  // State is the CSRF guard: Google hands it back, and the callback refuses a
  // code that does not carry the cookie's matching value.
  const state = randomBytes(16).toString("hex");
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(consentUrl(origin, state));
  response.cookies.set("drive_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
  });
  return response;
}
