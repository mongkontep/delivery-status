import test from "node:test";
import assert from "node:assert/strict";
import { createTracker, parseThailandPostDate, thailandPost, thailandPostStatus, trackingMore } from "../src/server.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch that answers by URL and records every call. */
const fakeFetch = (routes) => {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    for (const [match, answer] of routes) if (String(url).includes(match)) return answer(calls.at(-1));
    throw new Error(`no route for ${url}`);
  };
  fn.calls = calls;
  return fn;
};

test("Thailand Post dates and codes", () => {
  assert.equal(parseThailandPostDate("19/07/2562 18:12:26+07:00"), "2019-07-19T11:12:26.000Z");
  assert.equal(parseThailandPostDate("26/10/2019 10:00:44+07:00"), "2019-10-26T03:00:44.000Z");
  assert.equal(parseThailandPostDate("1/2/2567 08:05"), "2024-02-01T01:05:00.000Z");
  assert.equal(parseThailandPostDate("nope"), null);
  assert.equal(thailandPostStatus("501"), "delivered");
  assert.equal(thailandPostStatus("203"), "returned");
  assert.equal(thailandPostStatus("211"), "in_transit");
  assert.equal(thailandPostStatus("999"), null);
});

const TP_ITEMS = {
  EF582568151TH: [
    { barcode: "EF582568151TH", status: "103", status_description: "รับฝาก", status_date: "24/09/2569 10:00:00+07:00", location: "หลักสี่", postcode: "10210" },
    { barcode: "EF582568151TH", status: "201", status_description: "อยู่ระหว่างการขนส่ง", status_date: "25/09/2569 02:10:00+07:00", location: "ศป.นครหลวง", postcode: "13180" },
    {
      barcode: "EF582568151TH",
      status: "501",
      status_description: "นำจ่ายสำเร็จ",
      status_date: "26/09/2569 13:30:00+07:00",
      location: "เชียงใหม่",
      postcode: "50000",
      delivery_status: "S",
      delivery_description: "ผู้รับได้รับเรียบร้อย",
      receiver_name: "สมชาย",
    },
  ],
};

test("thailandPost provider", async () => {
  const fetch = fakeFetch([
    ["/authenticate/token", () => json({ token: "dyn", expire: "2099-01-01 00:00:00+07:00" })],
    ["/track", () => json({ response: { items: TP_ITEMS }, message: "successful", status: true })],
  ]);
  const tracker = createTracker({ thailandPost: { token: "static", fetch } });
  const [s, missing] = await tracker.track(["EF582568151TH", "EE123456785TH"]);

  assert.equal(fetch.calls[0].init.headers.Authorization, "Token static");
  assert.equal(fetch.calls[1].init.headers.Authorization, "Token dyn");
  assert.deepEqual(fetch.calls[1].body, { status: "all", language: "TH", barcode: ["EF582568151TH", "EE123456785TH"] });

  assert.equal(s.carrier, "thailand-post");
  assert.equal(s.status, "delivered");
  assert.equal(s.delivered, true);
  assert.equal(s.receiver, "สมชาย");
  assert.equal(s.events.length, 3);
  assert.equal(s.events[0].text, "นำจ่ายสำเร็จ · ผู้รับได้รับเรียบร้อย");
  assert.equal(s.events[0].time, "2026-09-26T06:30:00.000Z");
  assert.equal(s.url, "https://track.thailandpost.co.th/?trackNumber=EF582568151TH");
  assert.equal(missing.error, "not_found");

  // the access token is reused, and answers are cached
  await tracker.track(["EF582568151TH"]);
  assert.equal(fetch.calls.length, 2);
  await tracker.track(["EE123456785TH"]);
  assert.equal(fetch.calls.filter((c) => c.url.includes("/authenticate/token")).length, 1);
});

test("thailandPost renews a rejected token once", async () => {
  let tokens = 0;
  let tracks = 0;
  const fetch = fakeFetch([
    ["/authenticate/token", () => json({ token: `t${++tokens}`, expire: "2099-01-01 00:00:00+07:00" })],
    ["/track", () => (++tracks === 1 ? json({ detail: "expired" }, 401) : json({ response: { items: TP_ITEMS }, status: true }))],
  ]);
  const p = thailandPost({ token: "static", fetch });
  const [s] = await p.track([{ number: "EF582568151TH" }]);
  assert.equal(s.events.length, 3);
  assert.equal(tokens, 2);
});

test("trackingMore provider, new and already registered numbers", async () => {
  const data = (n, courier) => ({
    tracking_number: n,
    courier_code: courier,
    delivery_status: "transit",
    latest_event: "Arrived at hub",
    origin_info: {
      trackinfo: [
        { checkpoint_date: "2026-10-01T09:00:00+07:00", tracking_detail: "Picked up", location: "Bangkok", checkpoint_delivery_status: "transit" },
        { checkpoint_date: "2026-10-02T08:00:00+07:00", tracking_detail: "Arrived at hub", location: "Ayutthaya", checkpoint_delivery_status: "transit" },
      ],
    },
  });
  const fetch = fakeFetch([
    ["/trackings/create", ({ body }) => (body.tracking_number === "KEX20898721369" ? json({ meta: { code: 4101, message: "exists" } }) : json({ meta: { code: 200 }, data: data(body.tracking_number, body.courier_code) }))],
    ["/trackings/get", ({ url }) => json({ meta: { code: 200 }, data: [data(new URL(url).searchParams.get("tracking_numbers"), "kerryexpress-th")] })],
  ]);
  const tracker = createTracker({ trackingMore: { apiKey: "k", fetch } });
  const [flash, kerry] = await tracker.track(["TH0915EKX18T2D", { number: "KEX20898721369", carrier: "kerry" }]);

  assert.equal(fetch.calls[0].init.headers["Tracking-Api-Key"], "k");
  assert.equal(fetch.calls.find((c) => c.body?.tracking_number === "TH0915EKX18T2D").body.courier_code, "flashexpress");
  assert.equal(flash.carrier, "flash");
  assert.equal(flash.status, "in_transit");
  assert.equal(flash.events[0].text, "Arrived at hub");
  assert.equal(kerry.carrier, "kerry");
  assert.equal(kerry.events.length, 2);
  assert.ok(fetch.calls.some((c) => c.url.includes("/trackings/get")));
});

test("routing: Thailand Post goes to its own API, the rest to TrackingMore", async () => {
  const seen = [];
  const fake = (name, carriers, acceptsUnknown) => ({
    name,
    carriers,
    acceptsUnknown,
    track: async (items) => {
      seen.push([name, items.map((i) => i.number)]);
      return items.map((i) => ({ number: i.number, carrier: i.carrier, events: [{ time: "2026-10-01T00:00:00Z", status: "accepted", text: "ok" }] }));
    },
  });
  const tracker = createTracker({
    thailandPost: fake("tp", ["thailand-post"]),
    trackingMore: fake("tm", ["kerry", "flash"], true),
  });
  const out = await tracker.track(["EF582568151TH", "KEX20898721369", "UNKNOWN12345"]);
  assert.deepEqual(seen.sort(), [["tm", ["KEX20898721369", "UNKNOWN12345"]], ["tp", ["EF582568151TH"]]]);
  assert.equal(out.length, 3);
  assert.equal(out[0].status, "accepted");
});

test("unsupported, invalid, too many, provider failure", async () => {
  const tracker = createTracker({
    max: 3,
    thailandPost: { carriers: ["thailand-post"], track: async () => { throw new Error("down"); } },
  });
  const [tp, kerry] = await tracker.track(["EF582568151TH", "KEX20898721369"]);
  assert.equal(tp.error, "provider_error");
  assert.equal(kerry.error, "unsupported");
  assert.equal(kerry.url, "https://th.kex-express.com/th/track/?track=KEX20898721369");
  await assert.rejects(tracker.track(["AAAAAA1", "AAAAAA2", "AAAAAA3", "AAAAAA4"]), { code: "too_many" });
  const [bad] = await tracker.track(["AB"]);
  assert.equal(bad.error, "invalid");
});

test("handleRequest", async () => {
  const tracker = createTracker({ providers: [{ carriers: ["thailand-post"], track: async (items) => items.map((i) => ({ number: i.number, carrier: i.carrier, events: [] })) }] });
  const res = await tracker.handleRequest(new Request("http://x/api/track", { method: "POST", body: JSON.stringify({ items: [{ number: "EF582568151TH" }] }) }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.shipments[0].number, "EF582568151TH");
  assert.equal((await tracker.handleRequest(new Request("http://x", { method: "GET" }))).status, 405);
  assert.equal((await tracker.handleRequest(new Request("http://x", { method: "POST", body: "{" }))).status, 400);
});

test("a number that fits several carriers: ask them all, keep the one that has it", async () => {
  const asked = [];
  // J&T and FedEx both take 12 digits; here only FedEx knows 820112345678, both know 811111111111
  const known = { "820112345678": ["fedex"], "811111111111": ["jt", "fedex"] };
  const tm = {
    carriers: ["jt", "fedex", "kerry"],
    acceptsUnknown: true,
    track: async (items) => {
      asked.push(...items.map((i) => `${i.carrier}:${i.number}`));
      return items.map((i) =>
        known[i.number]?.includes(i.carrier)
          ? { number: i.number, carrier: i.carrier, events: [{ time: "2026-10-01T00:00:00Z", status: "in_transit", text: `${i.carrier} has it` }] }
          : { number: i.number, carrier: i.carrier, error: "not_found", events: [] },
      );
    },
  };
  const tracker = createTracker({ trackingMore: tm });
  const [onlyFedex, both, none, picked] = await tracker.track([
    "820112345678",
    "811111111111",
    "822222222222",
    { number: "833333333333", carrier: "fedex" },
  ]);

  assert.equal(onlyFedex.carrier, "fedex");
  assert.equal(onlyFedex.events[0].text, "fedex has it");
  assert.equal(onlyFedex.url, "https://www.fedex.com/fedextrack/?trknbr=820112345678");
  assert.equal(both.carrier, "jt"); // both have it: the likelier format wins
  assert.equal(none.error, "not_found");
  assert.equal(none.carrier, "jt");
  // a picked carrier is the only one asked
  assert.ok(asked.includes("fedex:833333333333"));
  assert.ok(!asked.includes("jt:833333333333"));
  assert.equal(picked.carrier, "fedex");

  // the winner is cached, so the next look-up asks nobody
  asked.length = 0;
  const [again] = await tracker.track(["820112345678"]);
  assert.deepEqual(asked, []);
  assert.equal(again.carrier, "fedex");
});

test("candidates are spread over providers and capped by maxCandidates", async () => {
  const seen = [];
  const fake = (name, carriers) => ({
    carriers,
    track: async (items) => {
      seen.push(...items.map((i) => `${name}:${i.carrier}`));
      return items.map((i) => ({ number: i.number, carrier: i.carrier, error: "not_found", events: [] }));
    },
  });
  const tracker = createTracker({ providers: [fake("a", ["jt"]), fake("b", ["fedex"])], maxCandidates: 1 });
  await tracker.track(["820112345678"]);
  assert.deepEqual(seen, ["a:jt"]);
  const all = createTracker({ providers: [fake("a", ["jt"]), fake("b", ["fedex"])] });
  seen.length = 0;
  await all.track(["820112345678"]);
  assert.deepEqual(seen.sort(), ["a:jt", "b:fedex"]);
});

test("`carriers` on an item limits the carriers tried", async () => {
  const asked = [];
  const tracker = createTracker({
    trackingMore: {
      carriers: ["jt", "fedex"],
      track: async (items) => {
        asked.push(...items.map((i) => i.carrier));
        return items.map((i) => ({ number: i.number, carrier: i.carrier, error: "not_found", events: [] }));
      },
    },
  });
  await tracker.track({ items: [{ number: "820112345678", carriers: ["fedex", "nope"] }] });
  assert.deepEqual(asked, ["fedex"]);
});

test("thailandPost: a rejected token says so", async () => {
  const fetch = async () => new Response("Unauthorized", { status: 401 });
  const [s] = await createTracker({ thailandPost: { token: "bad", fetch } }).track(["EF582568151TH"]);
  assert.equal(s.error, "provider_error");
  assert.match(s.detail, /rejected the token \(HTTP 401\)/);
});
