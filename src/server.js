// Parcel tracking on the server: "@inverz/delivery-status/server".
// Keeps the API keys off the page and turns every carrier's answer into one Shipment shape.
// No dependencies: it uses fetch, so it runs on Node 18+, Firebase / Cloud Functions, Next.js and edge runtimes.
// Each provider lives in ./providers; createTrackerFromEnv() switches them on from environment variables
// (see ENV_PROVIDERS in ./providers/env.js for every variable).
import { cleanNumber, detectCarrier, getCarrier, isTrackingNumber, trackingUrl } from "./core.js";
import { finalizeShipment } from "./status.js";
import { TrackingError } from "./providers/util.js";
import { thailandPost } from "./providers/thailand-post.js";
import { trackingMore } from "./providers/trackingmore.js";
import { providersFromEnv } from "./providers/env.js";

export { cleanNumber, detectCarrier, parseNumbers, CARRIERS, STATUSES, statusFromText } from "./core.js";
export { TrackingError } from "./providers/util.js";
export { thailandPost, thailandPostStatus, parseThailandPostDate } from "./providers/thailand-post.js";
export { trackingMore } from "./providers/trackingmore.js";
export { ENV_PROVIDERS, checkEnv, providersFromEnv } from "./providers/env.js";
export { flash, flashSign } from "./providers/flash.js";
export { ninjaVan } from "./providers/ninjavan.js";
export { jt, jtDigest } from "./providers/jt.js";
export { dhlEcommerce } from "./providers/dhl-ecommerce.js";
export { shopee, shopeeRefreshToken, lazada, lazadaRefreshToken, tiktokShop, marketplaceStatus } from "./providers/marketplaces.js";
export { track17, track123, afterShip, ship24 } from "./providers/aggregators.js";

/* ---------------------------------------------------------------- tracker */

/** Request body → [{ number, carrier }]. Takes { items }, { numbers } or a bare array; strings or objects. */
const readItems = (body, max) => {
  const raw = Array.isArray(body) ? body : body?.items ?? body?.numbers ?? [];
  if (!Array.isArray(raw)) throw new TrackingError("bad_request", "Send { items: [{ number, carrier }] }");
  const seen = new Map();
  for (const r of raw) {
    const number = cleanNumber(typeof r === "string" ? r : r?.number);
    const carrier = typeof r === "object" && r?.carrier && getCarrier(r.carrier) ? r.carrier : null;
    // `carriers` limits which carriers a number without `carrier` may be tried with
    const carriers = typeof r === "object" && Array.isArray(r?.carriers) ? r.carriers.filter((c) => getCarrier(c)) : null;
    if (number && !seen.has(number)) seen.set(number, carriers?.length ? { number, carrier, carriers } : { number, carrier });
  }
  const items = [...seen.values()];
  if (items.length > max) throw new TrackingError("too_many", `Up to ${max} numbers per request`);
  return items;
};

/** Has the carrier actually seen this parcel? */
const hasData = (s) => !s.error && s.events?.length > 0;

/** Of the answers for one number (best guess first), the one to show. */
const pick = (answers) =>
  answers.find(hasData) ??
  answers.find((s) => !s.error && s.status !== "not_found") ??
  answers.find((s) => s.error === "not_found") ??
  answers[0];

/**
 * Puts the providers together.
 *
 *   const tracker = createTracker({
 *     thailandPost: { token: process.env.THAILAND_POST_TOKEN },
 *     providers: [flash({ mchId, key })],
 *   });
 *   const shipments = await tracker.track(["EF582568151TH", { number: "TH0915EKX18T2D", carrier: "flash" }]);
 *
 * Which carrier: a number with a carrier picked goes to that carrier only. Without one, every
 * carrier whose format fits (up to `maxCandidates`) is asked at the same time and the one that
 * has the parcel wins; when several have it, the likelier format wins. A number no format fits
 * goes to a provider that detects carriers itself (an aggregator).
 *
 * Which provider: for each carrier the providers are tried in the order given (your own first,
 * then thailandPost, then trackingMore); the next one is asked only when one had no record of
 * the parcel or failed.
 *
 * Results come back in the same order, one per number, never thrown: problems are in `error`.
 */
export const createTracker = ({ thailandPost: tp, trackingMore: tm, providers = [], max = 20, maxCandidates = 3, cacheSeconds = 300 } = {}) => {
  const list = [...providers];
  if (tp) list.push(tp.track ? tp : thailandPost(tp));
  if (tm) list.push(tm.track ? tm : trackingMore(tm));
  const cache = new Map(); // "carrier:number" → { at, shipment }

  /** Providers that can answer for a carrier (null: carrier unknown), in order. */
  const providersFor = (carrier) =>
    list.filter((p) => p.anyCarrier || (carrier ? p.carriers?.includes(carrier) : p.acceptsUnknown));

  /** The carriers to ask for one item: the picked one, else every format match that some provider covers. */
  const candidates = (it) => {
    if (it.carrier) return [it.carrier];
    const guesses = detectCarrier(it.number, { carriers: it.carriers }).map((c) => c.id);
    const found = guesses.filter((id) => providersFor(id).length).slice(0, maxCandidates);
    if (found.length) return found;
    // null lets a detecting provider work it out; without one, keep the best guess for its link
    return [providersFor(null).length ? null : guesses[0] ?? null];
  };

  const fresh = (key) => {
    const hit = cache.get(key);
    return hit && Date.now() - hit.at < cacheSeconds * 1000 ? hit.shipment : null;
  };

  const track = async (input) => {
    const items = readItems(input, max);
    const answers = new Map(items.map((it) => [it.number, []])); // number → [{ rank, shipment }]
    const done = new Set(); // numbers that already have a parcel with events
    let open = []; // { number, carrier, rank, queue: providers still to try }

    for (const it of items) {
      const add = (rank, shipment) => answers.get(it.number).push({ rank, shipment });
      if (!isTrackingNumber(it.number)) {
        add(0, { number: it.number, carrier: it.carrier, error: "invalid", events: [] });
        continue;
      }
      candidates(it).forEach((carrier, rank) => {
        const cached = fresh(`${carrier}:${it.number}`);
        const queue = providersFor(carrier);
        if (cached) {
          add(rank, cached);
          done.add(it.number);
        } else if (!queue.length) add(rank, { number: it.number, carrier, error: "unsupported", events: [] });
        else open.push({ number: it.number, carrier, rank, queue });
      });
    }

    // round by round: each open (number, carrier) asks its next provider, until one has the parcel
    while (open.length) {
      const round = open.filter((o) => !done.has(o.number));
      if (!round.length) break;
      const groups = new Map(); // provider → [attempt]
      for (const o of round) {
        const p = o.queue.shift();
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(o);
      }
      await Promise.all(
        [...groups].map(async ([provider, group]) => {
          let found;
          try {
            found = await provider.track(group.map(({ number, carrier }) => ({ number, carrier })));
          } catch (e) {
            found = group.map((g) => ({ number: g.number, carrier: g.carrier, error: "provider_error", events: [], detail: e.message }));
          }
          // the same number can be in a group twice (two carriers on one provider), so match by position,
          // or by number and carrier when a provider answers in its own order
          group.forEach((asked, i) => {
            const s =
              (found.length === group.length && found[i]?.number === asked.number ? found[i] : null) ??
              found.find((f) => f.number === asked.number && (!asked.carrier || f.carrier === asked.carrier)) ??
              { number: asked.number, carrier: asked.carrier, error: "not_found", events: [] };
            const carrier = s.carrier ?? asked.carrier;
            const shipment = finalizeShipment({ ...s, carrier, url: s.url ?? trackingUrl(carrier, s.number) });
            answers.get(asked.number).push({ rank: asked.rank, shipment });
            if (hasData(shipment)) {
              done.add(asked.number);
              cache.set(`${asked.carrier}:${asked.number}`, { at: Date.now(), shipment });
            }
            // a provider that knows the parcel but has no events yet (just registered) is not asked again
            if (!shipment.error) asked.queue.length = 0;
          });
        }),
      );
      open = open.filter((o) => o.queue.length && !done.has(o.number));
    }

    return items.map((it) => {
      const ranked = answers.get(it.number).sort((a, b) => a.rank - b.rank).map((a) => a.shipment);
      const s = pick(ranked) ?? { number: it.number, carrier: it.carrier, error: "not_found", events: [] };
      return finalizeShipment({ ...s, url: s.url ?? trackingUrl(s.carrier, s.number) });
    });
  };

  /** Turns a request body into the JSON answer: { shipments } or { error }, with an HTTP status. */
  const respond = async (body) => {
    try {
      return { status: 200, json: { shipments: await track(body) } };
    } catch (e) {
      const code = e instanceof TrackingError ? e.code : "server_error";
      return { status: code === "server_error" ? 500 : 400, json: { error: code, message: e.message } };
    }
  };

  return {
    /** names of the providers in use, in the order they are tried */
    providers: list.map((p) => p.name ?? "custom"),
    track,
    /** For fetch-style routes (Next.js app router, Hono, Cloudflare, Deno): POST Request → Response. */
    async handleRequest(request) {
      if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "bad_request" }, { status: 400 });
      }
      const r = await respond(body);
      return Response.json(r.json, { status: r.status });
    },
    /** For Express / Firebase Functions: (req, res) with `req.body` already parsed. */
    async expressHandler(req, res) {
      if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
      const r = await respond(req.body);
      res.status(r.status).json(r.json);
    },
  };
};

/**
 * A tracker set up from environment variables (process.env by default, or pass your own object,
 * e.g. Cloudflare's `env`). Every provider whose variables are all set is switched on; with none,
 * every number still gets its carrier and a link to the carrier's tracking page.
 * Marketplaces also need functions in `hooks`, e.g. { shopee: { findOrder, getAccessToken } }.
 * Providers you pass in `providers` are tried first.
 *
 *   const tracker = createTrackerFromEnv();
 *   export const POST = (req) => tracker.handleRequest(req);
 */
export const createTrackerFromEnv = (env, { hooks, fetch: fetchFn, providers: own = [], ...options } = {}) =>
  createTracker({ ...options, providers: [...own, ...providersFromEnv(env, fetchFn, hooks)] });
