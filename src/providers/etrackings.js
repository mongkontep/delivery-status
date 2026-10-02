// eTrackings (Thai multi-carrier service): https://apps.etrackings.com/en/docs/api-reference
// API Key + Key Secret from Settings › API Keys. Covers Kerry, Flash, J&T, SPX, BEST, Nim and DHL
// eCommerce (not Thailand Post, Lazada, FedEx, UPS or DHL Express). One number per call, answered
// straight away; server side only (no CORS).
import { CARRIERS } from "../carriers.js";
import { getCarrier } from "../core.js";
import { statusFromText } from "../status.js";
import { TrackingError, mapLimit, readJson } from "./util.js";

const BASE = "https://api.etrackings.com/api/v3";

/** eTrackings statuses → ours. ON_UNABLE_TO_SEND covers both a failed attempt and a return. */
const STATUS = {
  ON_PICKED_UP: "accepted",
  ON_SHIPPING: "out_for_delivery",
  ON_DELIVERED: "delivered",
  ON_UNABLE_TO_SEND: "failed_attempt",
  ON_OTHER_STATUS: "in_transit",
};

const toStatus = (code, text) => {
  const s = STATUS[code];
  // the wording tells a return from a failed attempt
  if (s === "failed_attempt" && statusFromText(text) === "returned") return "returned";
  return s ?? statusFromText(text) ?? null;
};

/**
 * Descriptions look like "13:59 เคอรี่จัดส่งพัสดุของคุณเรียบร้อยแล้ว - คานหาม, พระนครศรีอยุธยา":
 * the time in front and the place after the last " - ". Splits them when they are there.
 */
const splitDescription = (text) => {
  const t = String(text ?? "").replace(/^\d{1,2}:\d{2}\s+/, "");
  const i = t.lastIndexOf(" - ");
  return i > 0 ? { text: t.slice(0, i), location: t.slice(i + 3) } : { text: t, location: "" };
};

export const eTrackings = ({ apiKey, keySecret, language = "th", concurrency = 4, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!apiKey || !keySecret) throw new TrackingError("config", "eTrackings needs `apiKey` and `keySecret`");

  const one = async (number, courier) => {
    const res = await fetchFn(`${BASE}/tracks/find`, {
      method: "POST",
      headers: {
        "Etrackings-Api-Key": apiKey,
        "Etrackings-Key-Secret": keySecret,
        "Accept-Language": language,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ courier, trackingNo: number }),
    });
    const data = await readJson(res);
    if (res.status === 404 || data.meta?.code === 404) return null;
    if (!res.ok || data.meta?.code !== 200) throw new TrackingError("provider_error", data.meta?.message || `eTrackings HTTP ${res.status}`, data);
    return data.data ?? null;
  };

  return {
    name: "eTrackings",
    carriers: CARRIERS.filter((c) => c.eTrackings).map((c) => c.id),
    track: (items) =>
      mapLimit(items, concurrency, async (it) => {
        const courier = getCarrier(it.carrier)?.eTrackings;
        if (!courier) return { number: it.number, carrier: it.carrier, error: "unsupported", events: [] };
        let d;
        try {
          d = await one(it.number, courier);
        } catch (e) {
          return { number: it.number, carrier: it.carrier, error: "provider_error", events: [], detail: e.message };
        }
        const details = (d?.timelines ?? []).flatMap((day) => day.details ?? []);
        if (!details.length) return { number: it.number, carrier: it.carrier, error: "not_found", events: [] };
        const events = details.map((e) => {
          const { text, location } = splitDescription(e.description);
          return {
            time: e.dateTime ? new Date(e.dateTime).toISOString() : null,
            status: toStatus(e.status, e.description) ?? "in_transit",
            text,
            location,
          };
        });
        return {
          number: it.number,
          carrier: it.carrier,
          status: toStatus(d.status, d.currentStatus) ?? undefined,
          receiver: d.detail?.signer || null,
          events,
        };
      }),
  };
};
