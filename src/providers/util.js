// Shared by the providers.

export class TrackingError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "TrackingError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** Reads a JSON body, or throws a provider_error that keeps the start of what came back. */
export const readJson = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new TrackingError("provider_error", `Expected JSON, got HTTP ${res.status}`, text.slice(0, 200));
  }
};

/** Runs `fn` over `list`, at most `limit` at a time, keeping the order. */
export const mapLimit = async (list, limit, fn) => {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
};


/* ---------------------------------------------------------------- crypto (Web Crypto, runs on edge too) */

const enc = new TextEncoder();

export const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const toBase64 = (bytes) => {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
};

export const sha256Hex = async (text) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));

export const hmacSha256Hex = async (secret, text) => {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
};

/** MD5 (RFC 1321) → 16 raw bytes. Web Crypto has no MD5, and J&T signs with it. */
export const md5 = (text) => {
  const msg = enc.encode(text);
  const len = msg.length;
  const words = new Uint32Array((((len + 8) >>> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << ((i % 4) * 8);
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  words[words.length - 2] = (len * 8) >>> 0;
  words[words.length - 1] = Math.floor(len / 0x20000000);
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let off = 0; off < words.length; off += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      const r = i >> 4;
      let f;
      let g;
      if (r === 0) [f, g] = [(b & c) | (~b & d), i];
      else if (r === 1) [f, g] = [(d & b) | (~d & c), (5 * i + 1) % 16];
      else if (r === 2) [f, g] = [b ^ c ^ d, (3 * i + 5) % 16];
      else [f, g] = [c ^ (b | ~d), (7 * i) % 16];
      const s = S[r * 4 + (i % 4)];
      const sum = (a + f + K[i] + words[off + g]) >>> 0;
      [a, d, c] = [d, c, b];
      b = (b + ((sum << s) | (sum >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((w, i) => {
    for (let j = 0; j < 4; j++) out[i * 4 + j] = (w >>> (j * 8)) & 0xff;
  });
  return out;
};

export const randomNonce = (length = 32) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => chars[b % chars.length]).join("");
};

/* ---------------------------------------------------------------- misc */

/** Splits a list into chunks of at most `size`. */
export const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** "2026-10-02 14:05:00" in Thai time (no zone given) → ISO 8601. Values with a zone are kept as they are. */
export const localToIso = (text, zone = "+07:00") => {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const withT = s.replace(" ", "T");
  const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(withT) ? withT.replace(/([+-]\d{2})(\d{2})$/, "$1:$2") : `${withT}${zone}`;
  const ms = Date.parse(zoned);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

/**
 * Keeps an access token until shortly before it runs out. `fetchToken()` returns
 * { token, expiresAt } (ms). `get(true)` forces a new one, e.g. after a 401.
 */
export const tokenCache = (fetchToken, marginMs = 5 * 60e3) => {
  let current = null;
  let pending = null;
  return {
    async get(force = false) {
      if (!force && current && current.expiresAt - Date.now() > marginMs) return current.token;
      // several requests at once share one token call
      pending ??= fetchToken().finally(() => (pending = null));
      current = await pending;
      return current.token;
    },
  };
};

/** Turns `{ hooks }` passed in code into a clear error when one is missing. */
export const needHook = (name, hooks, key) => {
  if (typeof hooks?.[key] !== "function") throw new TrackingError("config", `${name} needs \`${key}\` (a function) passed in code, not in .env`);
  return hooks[key];
};
