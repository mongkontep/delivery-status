// TrackingMore v4 (paid aggregator): https://www.trackingmore.com
import { CARRIERS } from "../carriers.js";
import { getCarrier } from "../core.js";
import { statusFromText } from "../status.js";
import { TrackingError, mapLimit, readJson } from "./util.js";

const TM_BASE = "https://api.trackingmore.com/v4";
const CARRIERS_WITH_TM = CARRIERS.filter((c) => c.trackingMore).map((c) => c.id);
const CARRIERS_BY_TM = Object.fromEntries(CARRIERS.filter((c) => c.trackingMore).map((c) => [c.trackingMore, c.id]));

/** TrackingMore delivery_status → our statuses. */
const TM_STATUS = {
  pending: "pending",
  notfound: "not_found",
  inforeceived: "info_received",
  transit: "in_transit",
  pickup: "out_for_delivery",
  delivered: "delivered",
  undelivered: "failed_attempt",
  exception: "exception",
  expired: "exception",
};

/**
 * TrackingMore v4 provider: every carrier in CARRIERS that has a `trackingMore` code.
 * Numbers are registered on first sight (one credit each) and read back for free afterwards.
 */
export const trackingMore = ({ apiKey, language = "th", concurrency = 4, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!apiKey) throw new TrackingError("config", "trackingMore needs `apiKey`");
  const headers = { "Tracking-Api-Key": apiKey, "Content-Type": "application/json" };

  const call = async (path, init) => {
    const res = await fetchFn(`${TM_BASE}${path}`, { ...init, headers });
    const data = await readJson(res);
    return { ok: res.ok, code: data.meta?.code, data: data.data, message: data.meta?.message };
  };

  const detect = async (number) => {
    const r = await call("/couriers/detect", { method: "POST", body: JSON.stringify({ tracking_number: number }) });
    const code = Array.isArray(r.data) ? r.data[0]?.courier_code : null;
    return code ?? null;
  };

  const one = async (it) => {
    const carrier = getCarrier(it.carrier);
    const courier = carrier?.trackingMore ?? (await detect(it.number));
    if (!courier) return { number: it.number, carrier: it.carrier ?? null, error: "unsupported", events: [] };

    let r = await call("/trackings/create", {
      method: "POST",
      body: JSON.stringify({ tracking_number: it.number, courier_code: courier, language }),
    });
    // 4101: already registered, read it back instead
    if (r.code === 4101) {
      const q = new URLSearchParams({ tracking_numbers: it.number, courier_code: courier });
      r = await call(`/trackings/get?${q}`, { method: "GET" });
    }
    if (r.code !== 200) throw new TrackingError("provider_error", r.message || `TrackingMore ${r.code}`, r);
    const d = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!d) return { number: it.number, carrier: it.carrier ?? null, error: "not_found", events: [] };

    const ourCarrier = carrier?.id ?? CARRIERS_BY_TM[d.courier_code] ?? null;
    const checkpoints = [...(d.origin_info?.trackinfo ?? []), ...(d.destination_info?.trackinfo ?? [])];
    const events = checkpoints.map((c) => ({
      time: c.checkpoint_date ? new Date(c.checkpoint_date).toISOString() : null,
      status: TM_STATUS[c.checkpoint_delivery_status] ?? statusFromText(c.tracking_detail) ?? "in_transit",
      text: c.tracking_detail ?? "",
      location: c.location ?? "",
    }));
    let status = TM_STATUS[d.delivery_status] ?? null;
    // TrackingMore files returns under "exception"; the text tells them apart
    if (status === "exception" && statusFromText(d.latest_event) === "returned") status = "returned";
    if (status === "not_found" || (!events.length && status === "pending")) {
      return { number: it.number, carrier: ourCarrier, error: status === "not_found" ? "not_found" : undefined, status: "pending", events: [] };
    }
    return { number: it.number, carrier: ourCarrier, status, events };
  };

  return {
    name: "trackingMore",
    carriers: CARRIERS_WITH_TM,
    // also takes numbers whose carrier is unknown: TrackingMore detects it
    acceptsUnknown: true,
    track: (items) =>
      mapLimit(items, concurrency, (it) =>
        one(it).catch((e) => ({ number: it.number, carrier: it.carrier ?? null, error: "provider_error", events: [], detail: e.message })),
      ),
  };
};

