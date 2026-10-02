// Ninja Van shipper API: https://api-docs.ninjavan.co
// client_id / client_secret from Ninja Dashboard → Settings → IT Settings. Tracking endpoints must be
// switched on by Ninja Van (th-devsupport@ninjavan.co), even in sandbox.
import { statusFromText } from "../status.js";
import { TrackingError, localToIso, mapLimit, readJson, tokenCache } from "./util.js";

const BASE = { production: "https://api.ninjavan.co", sandbox: "https://api-sandbox.ninjavan.co" };

/** Ninja Van's event `status` text → our statuses. */
const STATUS = {
  "pending pickup": "info_received",
  "driver dispatched for pickup": "info_received",
  "picked up": "accepted",
  "pickup exception": "exception",
  "arrived at origin hub": "in_transit",
  "in transit to next sorting hub": "in_transit",
  "arrived at transit hub": "in_transit",
  "arrived at destination hub": "in_transit",
  "international transit": "in_transit",
  "on vehicle for delivery": "out_for_delivery",
  "at pudo": "out_for_delivery",
  delivered: "delivered",
  "delivered/received by customer": "delivered",
  completed: "delivered",
  "delivery exception": "failed_attempt",
  "return to shipper exception": "exception",
  "returned to sender": "returned",
  cancelled: "exception",
};

const hubOf = (e) => {
  const info = Object.entries(e).find(([k, v]) => k.endsWith("_information") && v && typeof v === "object")?.[1];
  return info ? [info.hub, info.city].filter(Boolean).join(", ") : e.comments ?? "";
};

export const ninjaVan = ({ clientId, clientSecret, country = "th", sandbox = false, concurrency = 4, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!clientId || !clientSecret) throw new TrackingError("config", "ninjaVan needs `clientId` and `clientSecret`");
  // every sandbox call goes to /sg, whatever the country
  const root = sandbox ? `${BASE.sandbox}/sg` : `${BASE.production}/${country.toLowerCase()}`;

  const token = tokenCache(async () => {
    const res = await fetchFn(`${root}/2.0/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
    });
    const data = await readJson(res);
    if (!res.ok || !data.access_token) throw new TrackingError("provider_error", "Ninja Van did not issue a token", data);
    const expiresAt = data.expires ? data.expires * 1000 : Date.now() + (data.expires_in ?? 3600) * 1000;
    return { token: data.access_token, expiresAt };
  });

  const one = async (number, retry = true) => {
    const res = await fetchFn(`${root}/1.0/orders/tracking-events/${encodeURIComponent(number)}`, {
      headers: { Authorization: `Bearer ${await token.get(!retry)}` },
    });
    if (res.status === 401 && retry) return one(number, false);
    if (res.status === 404) return null;
    const data = await readJson(res);
    if (!res.ok) throw new TrackingError("provider_error", data?.error?.message || `Ninja Van HTTP ${res.status}`, data);
    return data;
  };

  return {
    name: "ninjaVan",
    carriers: ["ninjavan"],
    track: (items) =>
      mapLimit(items, concurrency, async (it) => {
        let data;
        try {
          data = await one(it.number);
        } catch (e) {
          return { number: it.number, carrier: "ninjavan", error: "provider_error", events: [], detail: e.message };
        }
        if (!data?.events?.length) return { number: it.number, carrier: "ninjavan", error: "not_found", events: [] };
        const events = data.events.map((e) => {
          let status = STATUS[String(e.status ?? "").toLowerCase()] ?? statusFromText(e.status) ?? "in_transit";
          if (status === "delivered" && e.is_parcel_on_rts_leg) status = "returned"; // delivered back to the shipper
          return { time: localToIso(e.timestamp, "Z"), status, text: e.status ?? "", location: hubOf(e) };
        });
        return { number: it.number, carrier: "ninjavan", events };
      }),
  };
};
