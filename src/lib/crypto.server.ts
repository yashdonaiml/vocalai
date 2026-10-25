// AES-GCM envelope for secrets stored in the database (BYOK keys, tool auth headers).
async function aesKey() {
  const secret = process.env["PROVIDER_KEY_SECRET"];
  if (!secret) throw new Error("Key storage not configured");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

export async function encryptSecret(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain));
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

export async function decryptSecret(blob: string) {
  const [iv = new Uint8Array(), ct = new Uint8Array()] = blob.split(".").map((p) => new Uint8Array(Buffer.from(p, "base64")));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aesKey(), ct);
  return new TextDecoder().decode(pt);
}

export async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}
