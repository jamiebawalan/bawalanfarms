import { createSign } from "node:crypto";

/**
 * Just enough Google Sheets API to write tabs, with no client library.
 *
 * A service-account JWT is a header, a claim and an RS256 signature. That is
 * about forty lines against a dependency tree of several hundred packages, and
 * this has to stay maintainable by one person a year from now.
 */

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export type Tab = { title: string; header: string[]; rows: (string | number)[][] };

export async function mirrorTabs(spreadsheetId: string, tabs: Tab[]): Promise<void> {
  const token = await accessToken();
  await ensureTabs(spreadsheetId, token, tabs.map((t) => t.title));

  for (const tab of tabs) {
    // Clear then write. A row deleted in Postgres has to disappear here too,
    // and an append-only mirror would quietly keep it forever.
    await api(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(tab.title)}:clear`,
      token, "POST", {},
    );
    await api(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(tab.title)}!A1?valueInputOption=RAW`,
      token, "PUT", { values: [tab.header, ...tab.rows] },
    );
  }
}

async function ensureTabs(spreadsheetId: string, token: string, titles: string[]) {
  const meta = await api(`${SHEETS}/${spreadsheetId}?fields=sheets.properties`, token, "GET");
  const existing = new Set(
    (meta.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title),
  );
  const missing = titles.filter((t) => !existing.has(t));
  if (missing.length === 0) return;

  await api(`${SHEETS}/${spreadsheetId}:batchUpdate`, token, "POST", {
    requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
  });
}

async function api(url: string, token: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sheets ${method} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function accessToken(): Promise<string> {
  const email = required("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const pem = required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(pem).toString("base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function b64url(text: string): string {
  return Buffer.from(text).toString("base64url");
}
