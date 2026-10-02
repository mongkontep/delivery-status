// Paid multi-carrier services besides TrackingMore: 17TRACK, Track123, AfterShip and Ship24.
// Each covers every carrier; when it has no code for a carrier the number goes without one and
// the service detects the carrier itself. Most must see a number once before they have events, so
// the very first look-up can come back as "pending" and fill in on a later one.
import { CARRIERS } from "../carriers.js";
import { getCarrier } from "../core.js";
import { statusFromText } from "../status.js";
import { TrackingError, chunk, localToIso, mapLimit, readJson } from "./util.js";

const ALL = CARRIERS.map((c) => c.id);
const byCode = (field) => Object.fromEntries(CARRIERS.filter((c) => c[field] != null).map((c) => [String(c[field]), c.id]));

/** One status list per service → ours. */
const STATUS = {
  NotFound: "not_found",
  InfoReceived: "info_received",
  INFO_RECEIVED: "info_received",
  InTransit: "in_transit",
  IN_TRANSIT: "in_transit",
  in_transit: "in_transit",
  PickedUp: "accepted",
  Departure: "in_transit",
  Arrival: "in_transit",
  AvailableForPickup: "out_for_delivery",
  available_for_pickup: "out_for_delivery",
  WAITING_DELIVERY: "out_for_delivery",
  OutForDelivery: "out_for_delivery",
  out_for_delivery: "out_for_delivery",
  DeliveryFailure: "failed_attempt",
  AttemptFail: "failed_attempt",
  DELIVERY_FAILED: "failed_attempt",
  failed_attempt: "failed_attempt",
  Delivered: "delivered",
  DELIVERED: "delivered",
  delivered: "delivered",
  Returning: "returned",
  Returned: "returned",
  Exception: "exception",
  ABNORMAL: "exception",
  exception: "exception",
  Expired: "exception",
  EXPIRED: "exception",
  Pending: "pending",
  pending: "pending",
  INIT: "pending",
  NO_RECORD: "not_found",
  info_received: "info_received",
};
const toStatus = (value) => STATUS[value] ?? null;

/** What every provider returns for one number. */
const shipment = (number, carrier, status, events) => {
  if (!events.length) {
    // seen for the first time, or not in the carrier's system yet
    return status === "not_found" || status == null
      ? { number, carrier, error: "not_found", events: [] }
      : { number, carrier, status: status === "not_found" ? "pending" : status, events: [] };
  }
  return { number, carrier, status: status === "not_found" ? undefined : status ?? undefined, events };
};

const failAll = (items, e) => items.map((it) => ({ number: it.number, carrier: it.carrier, error: "provider_error", events: [], detail: e.message }));

/* ---------------------------------------------------------------- 17TRACK */

/** 17TRACK API v2.4: https://api.17track.net/en/doc?version=v2.4 — header 17token. */
export const track17 = ({ apiKey, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!apiKey) throw new TrackingError("config", "track17 needs `apiKey`");
  const base = "https://api.17track.net/track/v2.4";
  const ours = byCode("track17");
  const call = async (path, body) => {
    const res = await fetchFn(`${base}${path}`, { method: "POST", headers: { "17token": apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await readJson(res);
    if (!res.ok || data.code !== 0) throw new TrackingError("provider_error", data.data?.errors?.[0]?.message || `17TRACK HTTP ${res.status}`, data);
    return data.data ?? {};
  };
  return {
    name: "track17",
    carriers: ALL,
    acceptsUnknown: true,
    async track(items) {
      const out = new Map(); // number → [{ code, shipment }]
      const put = (number, code, s) => out.set(number, [...(out.get(number) ?? []), { code: String(code ?? ""), shipment: s }]);
      for (const group of chunk(items, 40)) {
        const req = group.map((it) => {
          const code = getCarrier(it.carrier)?.track17;
          return code ? { number: it.number, carrier: code } : { number: it.number };
        });
        try {
          await call("/register", req); // already registered numbers come back in `rejected`; that is fine
          const data = await call("/gettrackinfo", req);
          for (const a of data.accepted ?? []) {
            const info = a.track_info ?? {};
            const events = (info.tracking?.providers ?? []).flatMap((p) => p.events ?? []).map((e) => ({
              time: e.time_iso ? new Date(e.time_iso).toISOString() : e.time_utc ? new Date(e.time_utc).toISOString() : null,
              status: toStatus(e.sub_status?.split("_")[0]) ?? toStatus(e.stage) ?? statusFromText(e.description) ?? "in_transit",
              text: e.description_translation?.description || e.description || "",
              location: e.location ?? "",
            }));
            const carrier = ours[String(a.carrier)] ?? group.find((g) => g.number === a.number)?.carrier ?? null;
            put(a.number, a.carrier, shipment(a.number, carrier, toStatus(info.latest_status?.status), events));
          }
        } catch (e) {
          failAll(group, e).forEach((s) => put(s.number, getCarrier(s.carrier)?.track17, s));
        }
      }
      return items.map((it) => {
        const list = out.get(it.number) ?? [];
        const code = String(getCarrier(it.carrier)?.track17 ?? "");
        // the answer for the carrier asked for; a number sent without one comes back with the detected carrier
        const hit = (code ? list.find((x) => x.code === code) : list[0]) ?? list.find((x) => !code || x.shipment.error);
        return hit?.shipment ?? { number: it.number, carrier: it.carrier, error: "not_found", events: [] };
      });
    },
  };
};

/* ---------------------------------------------------------------- Track123 */

/** Track123 Open API v2.1: https://docs.track123.com — header Track123-Api-Secret. */
export const track123 = ({ apiSecret, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!apiSecret) throw new TrackingError("config", "track123 needs `apiSecret`");
  const base = "https://api.track123.com/gateway/open-api/tk/v2.1";
  const ours = byCode("track123");
  const call = async (path, body) => {
    const res = await fetchFn(`${base}${path}`, { method: "POST", headers: { "Track123-Api-Secret": apiSecret, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await readJson(res);
    // the success code is not documented reliably, so only a missing `data` counts as a failure
    if (!res.ok || data.data == null) throw new TrackingError("provider_error", data.msg || `Track123 ${data.code ?? res.status}`, data);
    return data.data ?? {};
  };
  return {
    name: "track123",
    carriers: ALL,
    acceptsUnknown: true,
    async track(items) {
      const out = new Map();
      for (const group of chunk(items, 100)) {
        const req = group.map((it) => ({ trackNo: it.number, courierCode: getCarrier(it.carrier)?.track123 ?? null }));
        try {
          await call("/track/import", req); // numbers seen before are rejected here, which is fine
          const data = await call("/track/query", { trackNoInfos: req.map((r) => (r.courierCode ? r : { trackNo: r.trackNo })) });
          for (const t of data.accepted?.content ?? []) {
            const details = [...(t.localLogisticsInfo?.trackingDetails ?? []), ...(t.lastMileInfo?.openApiWayBillInfo?.trackingDetails ?? [])];
            const events = details.map((d) => ({
              time: d.eventTimeZeroUTC ? new Date(d.eventTimeZeroUTC).toISOString() : localToIso(d.eventTime),
              status: toStatus(d.transitSubStatus?.split("_").slice(0, -1).join("_")) ?? statusFromText(d.eventDetail) ?? "in_transit",
              text: d.eventDetail ?? "",
              location: d.address ?? "",
            }));
            const carrier = ours[t.courierCode] ?? group.find((g) => g.number === t.trackNo)?.carrier ?? null;
            out.set(t.trackNo, shipment(t.trackNo, carrier, toStatus(t.transitStatus), events));
          }
        } catch (e) {
          failAll(group, e).forEach((s) => out.set(s.number, s));
        }
      }
      return items.map((it) => out.get(it.number) ?? { number: it.number, carrier: it.carrier, error: "not_found", events: [] });
    },
  };
};

/* ---------------------------------------------------------------- AfterShip */

/** AfterShip Tracking API 2026-07: header as-api-key. Registers unknown numbers, reads known ones. */
export const afterShip = ({ apiKey, version = "2026-07", concurrency = 4, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!apiKey) throw new TrackingError("config", "afterShip needs `apiKey`");
  const base = `https://api.aftership.com/tracking/${version}`;
  const ours = byCode("afterShip");
  const call = async (path, init = {}) => {
    const res = await fetchFn(`${base}${path}`, { ...init, headers: { "as-api-key": apiKey, "Content-Type": "application/json" } });
    return readJson(res);
  };
  const toShipment = (t, fallbackCarrier) =>
    shipment(
      String(t.tracking_number).toUpperCase(),
      ours[t.slug] ?? fallbackCarrier ?? null,
      toStatus(t.tag),
      (t.checkpoints ?? []).map((c) => ({
        time: localToIso(c.checkpoint_time),
        status: toStatus(c.tag) ?? statusFromText(c.message) ?? "in_transit",
        text: c.message ?? "",
        location: c.location || [c.city, c.state].filter(Boolean).join(", "),
      })),
    );
  return {
    name: "afterShip",
    carriers: ALL,
    acceptsUnknown: true,
    async track(items) {
      const known = new Map();
      try {
        for (const group of chunk([...new Set(items.map((i) => i.number))], 25)) {
          const data = await call(`/trackings?${new URLSearchParams({ tracking_numbers: group.join(",") })}`);
          for (const t of data.data?.trackings ?? []) known.set(String(t.tracking_number).toUpperCase() + "|" + t.slug, t);
        }
      } catch (e) {
        return failAll(items, e);
      }
      return mapLimit(items, concurrency, async (it) => {
        const slug = getCarrier(it.carrier)?.afterShip;
        const existing = [...known.entries()].find(([k]) => k.startsWith(`${it.number}|`) && (!slug || k.endsWith(`|${slug}`)))?.[1];
        if (existing) return toShipment(existing, it.carrier);
        try {
          const data = await call("/trackings", { method: "POST", body: JSON.stringify({ tracking_number: it.number, ...(slug && { slug }) }) });
          if (data.meta?.code >= 400) throw new TrackingError("provider_error", data.meta.message, data);
          return toShipment(data.data?.tracking ?? data.data ?? {}, it.carrier);
        } catch (e) {
          return failAll([it], e)[0];
        }
      });
    },
  };
};

/* ---------------------------------------------------------------- Ship24 */

/** Ship24 Tracking API v1: https://docs.ship24.com — Bearer key. One synchronous call per number. */
export const ship24 = ({ apiKey, concurrency = 4, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!apiKey) throw new TrackingError("config", "ship24 needs `apiKey`");
  return {
    name: "ship24",
    carriers: ALL,
    acceptsUnknown: true,
    // Ship24 detects the carrier itself, so each number is asked once whatever carrier was guessed
    track: async (items) => {
      const numbers = [...new Set(items.map((i) => i.number))];
      const found = new Map(
        await mapLimit(numbers, concurrency, async (number) => {
          try {
            const res = await fetchFn("https://api.ship24.com/public/v1/trackers/track", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ trackingNumber: number }),
            });
            const data = await readJson(res);
            if (!res.ok) throw new TrackingError("provider_error", data.errors?.[0]?.message || `Ship24 HTTP ${res.status}`, data);
            return [number, data.data?.trackings?.[0] ?? null];
          } catch (e) {
            return [number, { error: e }];
          }
        }),
      );
      return items.map((it) => {
        const t = found.get(it.number);
        if (t?.error) return failAll([it], t.error)[0];
        const events = (t?.events ?? []).map((e) => ({
          time: localToIso(e.occurrenceDatetime),
          status: toStatus(e.statusMilestone) ?? statusFromText(e.status) ?? "in_transit",
          text: e.status ?? "",
          location: e.location ?? "",
        }));
        return shipment(it.number, it.carrier, toStatus(t?.shipment?.statusMilestone), events);
      });
    },
  };
};
