/**
 * Genera y firma un JWT RS256 para autenticar contra Google OAuth2 con una
 * Service Account, usando SubtleCrypto del runtime de Workers (sin librerías
 * pesadas de Node).
 */

/** base64url sin padding, a partir de bytes. */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url a partir de un string UTF-8. */
function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

/** Convierte una private key PEM (PKCS8) a ArrayBuffer para importKey. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Normaliza \n literales (típico de secrets guardados como string).
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

let cachedKey: CryptoKey | null = null;

async function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

/**
 * Arma un JWT firmado (RS256) con el claim set para pedir un access token de
 * Google con el scope de Sheets.
 *
 * @param nowSeconds tiempo actual en segundos (Unix). Se pasa explícito para
 *   testeabilidad.
 */
export async function createSignedJwt(params: {
  serviceAccountEmail: string;
  privateKeyPem: string;
  scope: string;
  nowSeconds: number;
}): Promise<string> {
  const { serviceAccountEmail, privateKeyPem, scope, nowSeconds } = params;

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccountEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600, // máximo 1h
  };

  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(
    JSON.stringify(claims),
  )}`;

  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}
