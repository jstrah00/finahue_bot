import { createSignedJwt } from "./jwt";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const KV_TOKEN_KEY = "google_access_token";
/** Cacheamos el token ~50 min (dura 60; margen de seguridad). */
const TOKEN_TTL_SECONDS = 50 * 60;

interface GoogleCreds {
  serviceAccountEmail: string;
  privateKeyPem: string;
}

/** Pide un access token nuevo a Google (firma JWT + intercambio OAuth2). */
export async function fetchAccessToken(creds: GoogleCreds): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const jwt = await createSignedJwt({
    serviceAccountEmail: creds.serviceAccountEmail,
    privateKeyPem: creds.privateKeyPem,
    scope: SHEETS_SCOPE,
    nowSeconds,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // No logueamos el JWT ni la private key; solo el error de Google.
    throw new Error(`Google token error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google no devolvió access_token");
  return data.access_token;
}

/**
 * Access token con cache en KV (TTL ~50 min). Renueva automáticamente cuando
 * expira. Pensado para el runtime del Worker.
 */
export async function getAccessToken(
  kv: KVNamespace,
  creds: GoogleCreds,
): Promise<string> {
  const cached = await kv.get(KV_TOKEN_KEY);
  if (cached) return cached;

  const token = await fetchAccessToken(creds);
  await kv.put(KV_TOKEN_KEY, token, { expirationTtl: TOKEN_TTL_SECONDS });
  return token;
}
