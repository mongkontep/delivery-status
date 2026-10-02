// Thailand Post's own Track & Trace API. Free token: https://track.thailandpost.co.th/developerGuide
import { statusFromText } from "../status.js";
import { TrackingError, readJson } from "./util.js";

const TP_BASE = "https://trackapi.thailandpost.co.th/post/api/v1";

/** Thailand Post status codes → our statuses. Anything else falls back on the first digit. */
const TP_CODES = {
  101: "info_received",
  102: "accepted",
  103: "accepted",
  104: "exception", // sender withdrew the item
  203: "returned",
  209: "exception", // export cancelled
  210: "exception", // import cancelled
  301: "out_for_delivery",
  302: "out_for_delivery", // waiting at a pick-up point
  401: "failed_attempt",
  402: "failed_attempt", // notice left at the post office
  501: "delivered",
  901: "delivered", // COD money paid to the seller
};
const TP_GROUPS = { 1: "accepted", 2: "in_transit", 3: "out_for_delivery", 4: "failed_attempt", 5: "delivered" };

export const thailandPostStatus = (code) => TP_CODES[code] ?? TP_GROUPS[String(code)[0]] ?? null;

/** "19/07/2562 18:12:26+07:00" (Buddhist year in Thai answers, Christian in English ones) → ISO 8601. */
export const parseThailandPostDate = (text) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{2}:?\d{2})?/.exec(String(text ?? "").trim());
  if (!m) return null;
  const [, d, mo, y, h, mi, s = "00", zone = "+07:00"] = m;
  const year = Number(y) > 2400 ? Number(y) - 543 : Number(y);
  const z = zone.includes(":") ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const iso = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:${s}${z}`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
};

/**
 * Thailand Post provider. `token` is the long-lived token from the developer dashboard; it is
 * exchanged for a one-month access token, which is kept in memory and renewed a day early.
 */
export const thailandPost = ({ token, language = "TH", fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!token) throw new TrackingError("config", "thailandPost needs `token`");
  let access = null; // { token, expires }

  const getAccessToken = async (force) => {
    if (!force && access && access.expires - Date.now() > 24 * 3600e3) return access.token;
    const res = await fetchFn(`${TP_BASE}/authenticate/token`, {
      method: "POST",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
    });
    // a wrong or revoked token is answered with 401/403 and no JSON
    if (res.status === 401 || res.status === 403) {
      throw new TrackingError("provider_error", `Thailand Post rejected the token (HTTP ${res.status}). Check THAILAND_POST_TOKEN.`);
    }
    const data = await readJson(res);
    if (!res.ok || !data.token) throw new TrackingError("provider_error", "Thailand Post did not issue a token", data);
    const expires = Date.parse(String(data.expire ?? "").replace(" ", "T"));
    access = { token: data.token, expires: Number.isNaN(expires) ? Date.now() + 7 * 24 * 3600e3 : expires };
    return access.token;
  };

  const request = async (barcodes, retry = true) => {
    const res = await fetchFn(`${TP_BASE}/track`, {
      method: "POST",
      headers: { Authorization: `Token ${await getAccessToken(!retry)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "all", language, barcode: barcodes }),
    });
    // a revoked or expired access token: get a fresh one once
    if ((res.status === 401 || res.status === 403) && retry) return request(barcodes, false);
    const data = await readJson(res);
    if (!res.ok || data.status === false) throw new TrackingError("provider_error", data.message || `Thailand Post HTTP ${res.status}`, data);
    return data.response?.items ?? {};
  };

  return {
    name: "thailandPost",
    carriers: ["thailand-post"],
    async track(items) {
      const out = [];
      // the API takes up to 100 numbers per call
      for (let i = 0; i < items.length; i += 100) {
        const chunk = items.slice(i, i + 100);
        const found = await request(chunk.map((it) => it.number));
        for (const it of chunk) {
          const rows = found[it.number] ?? [];
          if (!rows.length) {
            out.push({ number: it.number, carrier: "thailand-post", error: "not_found", events: [] });
            continue;
          }
          const events = rows.map((r) => ({
            time: parseThailandPostDate(r.status_date),
            status: thailandPostStatus(r.status) ?? statusFromText(r.status_description) ?? "in_transit",
            text: [r.status_description, r.delivery_description].filter(Boolean).join(" · "),
            location: [r.location, r.postcode].filter(Boolean).join(" "),
            code: String(r.status),
          }));
          const receiver = rows.map((r) => r.receiver_name).filter(Boolean).pop() ?? null;
          out.push({ number: it.number, carrier: "thailand-post", events, receiver });
        }
      }
      return out;
    },
  };
};

