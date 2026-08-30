/**
 * Authorising as the owner, not as a robot.
 *
 * The Sheets mirror uses a service account, which works because it only ever
 * edits a spreadsheet somebody already made and shared with it. Drive is
 * different: the app has to create files, and a service account has no storage
 * of its own to create them in. Google's answer for that is a Shared Drive or
 * domain-wide delegation, and both need Workspace. The farm runs on a personal
 * Gmail, so the app asks the owner for permission once and acts as her.
 *
 * That is also the better answer on its own terms. The files end up owned by
 * her, in her Drive, counting against her storage — hers to keep if this app
 * ever stops existing, which is the whole point of putting them there.
 *
 * The scope is drive.file: access to files this app created, and nothing else.
 * It cannot read the rest of her Drive, and Google classes it as non-sensitive,
 * so there is no verification review to sit through.
 */

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/drive/callback`;
}

/** Where to send the owner to say yes. */
export function consentUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: required("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    // Offline plus an explicit consent prompt is what actually returns a
    // refresh token. Without both, a second authorisation silently returns
    // only an access token and the connection dies in an hour.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH}?${params.toString()}`;
}

export type Tokens = { accessToken: string; refreshToken: string | null };

export async function exchangeCode(code: string, origin: string): Promise<Tokens> {
  const body = new URLSearchParams({
    code,
    client_id: required("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
  const json = await post(body, "Could not finish connecting to Google");
  return {
    accessToken: String(json.access_token),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
  };
}

/** An access token lasts an hour; the refresh token is what we keep. */
export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: required("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const json = await post(body, "Google would not renew the connection");
  return String(json.access_token);
}

async function post(body: URLSearchParams, whenItFails: string) {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    // invalid_grant is the one worth naming: the owner revoked access, or the
    // consent screen is still in Testing, where Google expires the token after
    // a week. Either way the fix is to connect again, not to retry.
    const reconnect = text.includes("invalid_grant");
    throw new Error(
      reconnect
        ? "Google has disconnected the farm's Drive. Connect it again from Settings."
        : `${whenItFails} (${res.status}).`,
    );
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
