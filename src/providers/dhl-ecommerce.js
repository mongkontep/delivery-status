// DHL eCommerce Asia API v2: https://api.dhlecommerce.dhl.com/API/docs/v2/restful.html
// clientId and password come with a DHL eCommerce Asia account (separate sandbox and production sets).
import { statusFromText } from "../status.js";
import { TrackingError, chunk, localToIso, readJson, tokenCache } from "./util.js";

const BASE = { production: "https://api.dhlecommerce.dhl.com", sandbox: "https://apitest.dhlecommerce.asia" };

/** "2026-10-02T14:05:00+07:00", the form DHL wants in `messageDateTime`. */
const bangkokNow = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19) + "+07:00";

export const dhlEcommerce = ({
  clientId,
  password,
  sandbox = false,
  soldToAccountId,
  pickupAccountId,
  messageVersion = "1.0",
  language,
  fetch: fetchFn = globalThis.fetch,
} = {}) => {
  if (!clientId || !password) throw new TrackingError("config", "dhlEcommerce needs `clientId` and `password`");
  const base = sandbox ? BASE.sandbox : BASE.production;

  // tokens last 24 hours; asking again within 12 hours returns the same one
  const token = tokenCache(async () => {
    const q = new URLSearchParams({ clientId, password, returnFormat: "json" });
    const res = await fetchFn(`${base}/rest/v1/OAuth/AccessToken?${q}`);
    const data = await readJson(res);
    const body = data.accessTokenResponse ?? data;
    if (!body.token) throw new TrackingError("provider_error", body.responseStatus?.message || "DHL eCommerce did not issue a token", data);
    const seconds = Number(body.expires_in_seconds ?? body.expire_in_seconds ?? 12 * 3600);
    return { token: body.token, expiresAt: Date.now() + seconds * 1000 };
  }, 30 * 60e3);

  const request = async (numbers, retry = true) => {
    const res = await fetchFn(`${base}/rest/v3/Tracking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackItemRequest: {
          hdr: {
            messageType: "TRACKITEM",
            accessToken: await token.get(!retry),
            messageDateTime: bangkokNow(),
            messageVersion,
            ...(language && { messageLanguage: language }),
          },
          bd: {
            trackingReferenceNumber: numbers,
            ...(soldToAccountId && { soldToAccountId }),
            ...(pickupAccountId && { pickupAccountId }),
          },
        },
      }),
    });
    const data = await readJson(res);
    const bd = data.trackItemResponse?.bd;
    const message = bd?.responseStatus?.message ?? "";
    if (/access token/i.test(message) && retry) return request(numbers, false);
    if (!bd) throw new TrackingError("provider_error", message || `DHL eCommerce HTTP ${res.status}`, data);
    return bd.shipmentItems ?? [];
  };

  return {
    name: "dhlEcommerce",
    carriers: ["dhl-ecommerce"],
    async track(items) {
      const found = new Map();
      // at most 100 numbers per call
      for (const group of chunk([...new Set(items.map((i) => i.number))], 100)) {
        for (const s of await request(group)) {
          for (const id of [s.trackingID, s.shipmentID].filter(Boolean)) found.set(String(id).toUpperCase(), s);
        }
      }
      return items.map((it) => {
        const s = found.get(it.number);
        if (!s?.events?.length) return { number: it.number, carrier: "dhl-ecommerce", error: "not_found", events: [] };
        const events = s.events.map((e) => ({
          // "LT" means local time; Thai parcels are on Bangkok time
          time: localToIso(e.dateTime),
          status: statusFromText(e.description) ?? "in_transit",
          text: e.description ?? "",
          location: [e.address?.city, e.address?.state].filter(Boolean).join(", "),
          code: e.status,
        }));
        return { number: it.number, carrier: "dhl-ecommerce", events };
      });
    },
  };
};
