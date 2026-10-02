// Flash Express merchant Open API: https://open-docs.flashexpress.com/
// mchId and key come from Flash staff. Form-encoded POSTs signed with SHA-256.
import { statusFromText } from "../status.js";
import { TrackingError, randomNonce, readJson, sha256Hex } from "./util.js";

const BASE = { production: "https://open-api.flashexpress.com", sandbox: "https://open-api-tra.flashexpress.com" };

/** Parcel `state` → our statuses (1 picked up … 9 cancelled). */
const STATE = { 1: "accepted", 2: "in_transit", 3: "out_for_delivery", 4: "exception", 5: "delivered", 6: "exception", 7: "returned", 8: "exception", 9: "exception" };

/** Route actions that say more than the parcel state does. */
const ACTION = {
  RECEIVED: "accepted",
  DELIVERY_TICKET_CREATION_SCAN: "out_for_delivery",
  DELIVERY_CONFIRM: "delivered",
  CHANGE_PARCEL_SIGNED: "delivered",
  DIFFICULTY_HANDOVER: "failed_attempt",
  DIFFICULTY_RE_TRANSIT: "failed_attempt",
  SYSTEM_AUTO_RETURN: "returned",
  CANCEL_PARCEL: "exception",
  CHANGE_PARCEL_CANCEL: "exception",
};

/**
 * Signature: every non-empty param except `sign`, sorted by name, as k=v&k=v, then "&key=" + key;
 * SHA-256, upper-case hex.
 */
export const flashSign = async (params, key) => {
  const base = Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== "" && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return (await sha256Hex(`${base}&key=${key}`)).toUpperCase();
};

/** Splits numbers into comma lists of at most 500 characters (the API's limit for `pnos`). */
const batches = (numbers) => {
  const out = [];
  let cur = [];
  for (const n of numbers) {
    if (cur.length && [...cur, n].join(",").length > 500) {
      out.push(cur);
      cur = [];
    }
    cur.push(n);
  }
  if (cur.length) out.push(cur);
  return out;
};

export const flash = ({ mchId, key, sandbox = false, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!mchId || !key) throw new TrackingError("config", "flash needs `mchId` and `key`");
  const base = sandbox ? BASE.sandbox : BASE.production;

  const request = async (pnos) => {
    const params = { mchId, nonceStr: randomNonce(), pnos: pnos.join(",") };
    params.sign = await flashSign(params, key);
    const res = await fetchFn(`${base}/open/v1/orders/routesBatch`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const data = await readJson(res);
    if (data.code !== 1) throw new TrackingError("provider_error", data.message || `Flash code ${data.code}`, data);
    return Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
  };

  return {
    name: "flash",
    carriers: ["flash"],
    async track(items) {
      const found = new Map();
      for (const group of batches([...new Set(items.map((i) => i.number))])) {
        for (const p of await request(group)) found.set(p.pno, p);
      }
      return items.map((it) => {
        const p = found.get(it.number);
        if (!p) return { number: it.number, carrier: "flash", error: "not_found", events: [] };
        const events = (p.routes ?? []).map((r) => ({
          time: r.routedAt ? new Date(r.routedAt * 1000).toISOString() : null,
          status: ACTION[r.routeAction] ?? STATE[r.state] ?? statusFromText(r.message) ?? "in_transit",
          text: r.message ?? "",
          code: r.routeAction,
        }));
        return { number: it.number, carrier: "flash", status: STATE[p.state] ?? undefined, statusText: p.stateText ?? null, events };
      });
    },
  };
};
