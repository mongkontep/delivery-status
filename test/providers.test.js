import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  afterShip,
  checkEnv,
  createTracker,
  createTrackerFromEnv,
  dhlEcommerce,
  flash,
  flashSign,
  jt,
  jtDigest,
  lazada,
  marketplaceStatus,
  ninjaVan,
  ship24,
  shopee,
  tiktokShop,
  track123,
  track17,
} from "../src/server.js";
import { lazadaSign, shopeeSign, tiktokSign } from "../src/providers/marketplaces.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fakeFetch = (routes) => {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url: String(url), init, headers: init.headers ?? {}, body: init.body };
    calls.push(call);
    for (const [match, answer] of routes) if (String(url).includes(match)) return answer(call);
    throw new Error(`no route for ${url}`);
  };
  fn.calls = calls;
  return fn;
};

const form = (body) => Object.fromEntries(new URLSearchParams(body));

/* ---------------------------------------------------------------- signatures */

test("signatures match node:crypto", async () => {
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  const hmac = (k, s) => createHmac("sha256", k).update(s).digest("hex");

  // Flash: sorted non-empty params, &key=, SHA-256 upper hex
  assert.equal(
    await flashSign({ mchId: "AA0001", nonceStr: "abc", pnos: "TH1,TH2", empty: "" }, "SECRET"),
    sha("mchId=AA0001&nonceStr=abc&pnos=TH1,TH2&key=SECRET").toUpperCase(),
  );
  // J&T: base64(md5(bizContent + privateKey))
  const biz = '{"billCodes":"820112345678"}';
  assert.equal(jtDigest(biz, "pk"), createHash("md5").update(biz + "pk").digest("base64"));
  // Shopee: hex hmac of the concatenation
  assert.equal(await shopeeSign("key", [1, "/api/v2/x", 100, "tok", 9]), hmac("key", "1/api/v2/x100tok9"));
  // Lazada: path + sorted key+value, upper hex
  assert.equal(await lazadaSign("sec", "/logistic/order/trace", { b: "2", a: "1", sign: "x" }), hmac("sec", "/logistic/order/tracea1b2").toUpperCase());
  // TikTok: secret + path + sorted params (no sign / access_token) + body + secret
  assert.equal(await tiktokSign("sec", "/p", { timestamp: "5", app_key: "k", access_token: "t" }), hmac("sec", "sec/papp_keyktimestamp5sec"));
});

test("marketplaceStatus", () => {
  assert.equal(marketplaceStatus("LOGISTICS_DELIVERY_DONE"), "delivered");
  assert.equal(marketplaceStatus("FAILED_DELIVERED"), "failed_attempt");
  assert.equal(marketplaceStatus("LOGISTICS_DELIVERY_FAILED"), "failed_attempt");
  assert.equal(marketplaceStatus("LOGISTICS_PICKUP_DONE"), "accepted");
  assert.equal(marketplaceStatus("LOGISTICS_READY"), "info_received");
  assert.equal(marketplaceStatus("LOGISTICS_LOST"), "exception");
  assert.equal(marketplaceStatus(""), null);
});

/* ---------------------------------------------------------------- carriers */

test("flash", async () => {
  const fetch = fakeFetch([
    [
      "/open/v1/orders/routesBatch",
      () =>
        json({
          code: 1,
          message: "success",
          data: [
            {
              pno: "TH0915EKX18T2D",
              state: 5,
              stateText: "เซ็นรับแล้ว",
              routes: [
                { routedAt: 1790000000, routeAction: "RECEIVED", message: "รับพัสดุ สาขาลาดพร้าว", state: 1 },
                { routedAt: 1790090000, routeAction: "DELIVERY_CONFIRM", message: "ผู้รับเซ็นรับแล้ว", state: 5 },
              ],
            },
          ],
        }),
    ],
  ]);
  const [s, missing] = await flash({ mchId: "AA0001", key: "K", fetch }).track([
    { number: "TH0915EKX18T2D", carrier: "flash" },
    { number: "TH0000000000AB", carrier: "flash" },
  ]);
  const sent = form(fetch.calls[0].body);
  assert.equal(fetch.calls[0].headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(sent.pnos, "TH0915EKX18T2D,TH0000000000AB");
  assert.equal(sent.sign, await flashSign({ mchId: sent.mchId, nonceStr: sent.nonceStr, pnos: sent.pnos }, "K"));
  assert.equal(s.status, "delivered");
  assert.equal(s.events[1].status, "delivered");
  assert.equal(s.events[0].time, new Date(1790000000 * 1000).toISOString());
  assert.equal(missing.error, "not_found");
});

test("ninjaVan: token, retry on 401, events", async () => {
  let tokens = 0;
  let calls = 0;
  const fetch = fakeFetch([
    ["/oauth/access_token", () => json({ access_token: `t${++tokens}`, expires_in: 3600 })],
    [
      "/tracking-events/NVTH404",
      () => json({ error: { message: "not found" } }, 404),
    ],
    [
      "/tracking-events/",
      () =>
        ++calls === 1
          ? json({}, 401)
          : json({
              tracking_number: "NVTH12345678",
              events: [
                { timestamp: "2026-10-01T03:00:00+0000", status: "Picked Up" },
                { timestamp: "2026-10-01T09:00:00+0000", status: "Arrived at Transit Hub", arrived_at_transit_hub_information: { hub: "Bang Na", city: "Bangkok" } },
                { timestamp: "2026-10-02T02:00:00+0000", status: "On Vehicle for Delivery" },
              ],
            }),
    ],
  ]);
  const p = ninjaVan({ clientId: "c", clientSecret: "s", fetch });
  const [s, none] = await p.track([
    { number: "NVTH12345678", carrier: "ninjavan" },
    { number: "NVTH404", carrier: "ninjavan" },
  ]);
  assert.ok(fetch.calls[0].url.startsWith("https://api.ninjavan.co/th/2.0/oauth/access_token"));
  assert.equal(tokens, 2); // the 401 got a fresh token
  assert.equal(s.events[2].status, "out_for_delivery");
  assert.equal(s.events[1].location, "Bang Na, Bangkok");
  assert.equal(s.events[0].time, "2026-10-01T03:00:00.000Z");
  assert.equal(none.error, "not_found");
  assert.ok(ninjaVan({ clientId: "c", clientSecret: "s", sandbox: true, fetch }));
});

test("jt", async () => {
  const fetch = fakeFetch([
    [
      "/logistics/trace",
      () =>
        json({
          code: "1",
          msg: "success",
          data: [
            {
              billCode: "820112345678",
              details: [
                { scanTime: "2026-10-01 10:00:00", desc: "รับพัสดุแล้ว", scanType: "รับพัสดุ", scanNetworkName: "สาขาบางนา", scanNetworkProvince: "กรุงเทพมหานคร" },
                { scanTime: "2026-10-02 15:30:00", desc: "นำส่งสำเร็จ ผู้รับเซ็นรับ", scanType: "เซ็นรับ" },
              ],
            },
          ],
        }),
    ],
  ]);
  const [s] = await jt({ apiAccount: "123", privateKey: "pk", fetch }).track([{ number: "820112345678", carrier: "jt" }]);
  const call = fetch.calls[0];
  const biz = form(call.body).bizContent;
  assert.deepEqual(JSON.parse(biz), { billCodes: "820112345678" });
  assert.equal(call.headers.apiAccount, "123");
  assert.equal(call.headers.digest, jtDigest(biz, "pk"));
  assert.match(call.headers.timestamp, /^\d{13}$/);
  assert.ok(call.url.startsWith("https://openapi.jtexpress.co.th/"));
  assert.equal(s.events[0].time, "2026-10-01T03:00:00.000Z"); // Bangkok time
  assert.equal(s.events[1].status, "delivered");
  assert.equal(s.events[0].location, "สาขาบางนา, กรุงเทพมหานคร");
});

test("dhlEcommerce", async () => {
  const fetch = fakeFetch([
    ["/OAuth/AccessToken", () => json({ accessTokenResponse: { token: "tok", expires_in_seconds: 86400, responseStatus: { code: "100000" } } })],
    [
      "/rest/v3/Tracking",
      ({ body }) => {
        assert.equal(JSON.parse(body).trackItemRequest.hdr.accessToken, "tok");
        return json({
          trackItemResponse: {
            bd: {
              shipmentItems: [
                {
                  trackingID: "THABC123456",
                  events: [{ status: "77093", description: "Successfully delivered", dateTime: "2026-10-02 11:00:00", timezone: "LT", address: { city: "Bangkok" } }],
                },
              ],
              responseStatus: { code: "200", message: "SUCCESS" },
            },
          },
        });
      },
    ],
  ]);
  const [s] = await dhlEcommerce({ clientId: "c", password: "p", fetch }).track([{ number: "THABC123456", carrier: "dhl-ecommerce" }]);
  assert.equal(s.events[0].status, "delivered");
  assert.equal(s.events[0].time, "2026-10-02T04:00:00.000Z");
});

/* ---------------------------------------------------------------- marketplaces */

test("shopee: findOrder + getAccessToken, signed call", async () => {
  const fetch = fakeFetch([
    [
      "/api/v2/logistics/get_tracking_info",
      () =>
        json({
          error: "",
          response: {
            order_sn: "2410ABC",
            logistics_status: "LOGISTICS_DELIVERY_DONE",
            tracking_info: [
              { update_time: 1790000000, description: "พัสดุถึงศูนย์คัดแยก", logistics_status: "LOGISTICS_PICKUP_DONE" },
              { update_time: 1790090000, description: "จัดส่งสำเร็จ", logistics_status: "LOGISTICS_DELIVERY_DONE" },
            ],
          },
        }),
    ],
  ]);
  const p = shopee({
    partnerId: 1001,
    partnerKey: "pk",
    shopId: 77,
    fetch,
    findOrder: async (n) => (n === "TH012345678912A" ? { orderId: "2410ABC" } : null),
    getAccessToken: async ({ shopId }) => `tok-${shopId ?? "default"}`,
  });
  const [s, unknown] = await p.track([
    { number: "TH012345678912A", carrier: "spx" },
    { number: "TH999999999999Z", carrier: "spx" },
  ]);
  const q = new URL(fetch.calls[0].url).searchParams;
  assert.equal(q.get("order_sn"), "2410ABC");
  assert.equal(q.get("access_token"), "tok-default");
  assert.equal(q.get("sign"), await shopeeSign("pk", [1001, "/api/v2/logistics/get_tracking_info", q.get("timestamp"), "tok-default", 77]));
  assert.equal(s.status, "delivered");
  assert.equal(s.events.length, 2);
  assert.equal(unknown.error, "not_found");
  assert.equal(fetch.calls.length, 1); // an unknown order is not sent
  assert.throws(() => shopee({ partnerId: 1, partnerKey: "k" }), /findOrder/);
});

test("lazada and tiktokShop", async () => {
  const fetch = fakeFetch([
    [
      "/logistic/order/trace",
      () =>
        json({
          code: "0",
          result: {
            module: [
              {
                package_detail_info_list: [
                  {
                    tracking_number: "LEXDO123456789",
                    logistic_detail_info_list: [{ event_time: "1790000000000", title: "Delivered", description: "Parcel delivered", detail_type: "delivered", package_location_name: "Bangkok" }],
                  },
                ],
              },
            ],
          },
        }),
    ],
    ["/fulfillment/202309/orders/", () => json({ code: 0, data: { tracking: [{ description: "Out for delivery", update_time_millis: 1790000000000 }] } })],
  ]);
  const hooks = { findOrder: async () => ({ orderId: "555" }), getAccessToken: async () => "tok" };
  const [lz] = await lazada({ appKey: "k", appSecret: "s", fetch, ...hooks }).track([{ number: "LEXDO123456789", carrier: "lex" }]);
  assert.equal(lz.events[0].status, "delivered");
  assert.equal(lz.events[0].location, "Bangkok");
  const lq = new URL(fetch.calls[0].url).searchParams;
  assert.equal(lq.get("order_id"), "555");
  assert.equal(lq.get("sign_method"), "sha256");

  const [tt] = await tiktokShop({ appKey: "k", appSecret: "s", fetch, ...hooks }).track([{ number: "820112345678", carrier: "jt" }]);
  assert.equal(tt.events[0].status, "out_for_delivery");
  assert.equal(fetch.calls[1].headers["x-tts-access-token"], "tok");
  assert.ok(fetch.calls[1].url.includes("/orders/555/tracking"));
});

/* ---------------------------------------------------------------- aggregators */

test("track17: register then gettrackinfo, carrier codes", async () => {
  const fetch = fakeFetch([
    ["/register", () => json({ code: 0, data: { accepted: [], rejected: [] } })],
    [
      "/gettrackinfo",
      () =>
        json({
          code: 0,
          data: {
            accepted: [
              {
                number: "KEX20898721369",
                carrier: 101405,
                track_info: {
                  latest_status: { status: "InTransit" },
                  tracking: { providers: [{ events: [{ time_iso: "2026-10-01T10:00:00+07:00", description: "Arrived at hub", location: "Bangkok" }] }] },
                },
              },
            ],
          },
        }),
    ],
  ]);
  const [s] = await track17({ apiKey: "k", fetch }).track([{ number: "KEX20898721369", carrier: "kerry" }]);
  assert.equal(fetch.calls[0].headers["17token"], "k");
  assert.deepEqual(JSON.parse(fetch.calls[0].body), [{ number: "KEX20898721369", carrier: 101405 }]);
  assert.equal(s.carrier, "kerry");
  assert.equal(s.status, "in_transit");
  assert.equal(s.events[0].time, "2026-10-01T03:00:00.000Z");
});

test("track123, afterShip and ship24", async () => {
  const fetch = fakeFetch([
    ["track123.com/gateway/open-api/tk/v2.1/track/import", () => json({ code: "00000", data: { accepted: [], rejected: [] } })],
    [
      "track123.com/gateway/open-api/tk/v2.1/track/query",
      () =>
        json({
          code: "00000",
          data: {
            accepted: {
              content: [
                {
                  trackNo: "TH0915EKX18T2D",
                  courierCode: "flashexpress",
                  transitStatus: "DELIVERED",
                  localLogisticsInfo: { trackingDetails: [{ eventTimeZeroUTC: "2026-10-02T04:00:00Z", eventDetail: "Delivered", address: "Chiang Mai" }] },
                },
              ],
            },
          },
        }),
    ],
    ["aftership.com/tracking/2026-07/trackings?", () => json({ meta: { code: 200 }, data: { trackings: [] } })],
    [
      "aftership.com/tracking/2026-07/trackings",
      ({ body }) =>
        json({
          meta: { code: 201 },
          data: { tracking_number: JSON.parse(body).tracking_number, slug: "spx-th", tag: "Pending", checkpoints: [] },
        }),
    ],
    [
      "api.ship24.com/public/v1/trackers/track",
      () =>
        json({
          data: {
            trackings: [
              {
                shipment: { statusMilestone: "out_for_delivery" },
                events: [{ occurrenceDatetime: "2026-10-02T08:00:00", status: "Out for delivery", location: "Bangkok", statusMilestone: "out_for_delivery" }],
              },
            ],
          },
        }),
    ],
  ]);
  const [t123] = await track123({ apiSecret: "s", fetch }).track([{ number: "TH0915EKX18T2D", carrier: "flash" }]);
  assert.equal(t123.status, "delivered");
  assert.equal(t123.carrier, "flash");

  const [as] = await afterShip({ apiKey: "a", fetch }).track([{ number: "TH012345678912A", carrier: "spx" }]);
  assert.equal(as.carrier, "spx");
  assert.equal(as.status, "pending"); // registered now, events come later
  assert.equal(as.error, undefined);

  const [s24] = await ship24({ apiKey: "z", fetch }).track([{ number: "NVTH12345678", carrier: "ninjavan" }]);
  assert.equal(s24.status, "out_for_delivery");
  assert.equal(s24.events[0].time, "2026-10-02T01:00:00.000Z");
  assert.equal(fetch.calls.find((c) => c.url.includes("ship24")).headers.Authorization, "Bearer z");
});

/* ---------------------------------------------------------------- routing across providers */

test("a provider with no record passes the number on to the next one", async () => {
  const asked = [];
  const fake = (name, carriers, has, extra = {}) => ({
    name,
    carriers,
    ...extra,
    track: async (items) => {
      asked.push(...items.map((i) => `${name}:${i.number}`));
      return items.map((i) =>
        has.includes(i.number)
          ? { number: i.number, carrier: i.carrier, events: [{ time: "2026-10-01T00:00:00Z", status: "in_transit", text: `from ${name}` }] }
          : { number: i.number, carrier: i.carrier, error: "not_found", events: [] },
      );
    },
  });
  const tracker = createTracker({
    providers: [
      fake("shop", undefined, ["TH0915EKX18T2D"], { anyCarrier: true }),
      fake("flashApi", ["flash"], ["TH1111111111AB"]),
      fake("aggregator", ["flash", "kerry"], ["TH2222222222AB", "KEX20898721369"], { acceptsUnknown: true }),
    ],
  });
  const [a, b, c, d] = await tracker.track(["TH0915EKX18T2D", "TH1111111111AB", "TH2222222222AB", "TH3333333333AB"]);
  assert.equal(a.events[0].text, "from shop");
  assert.equal(b.events[0].text, "from flashApi");
  assert.equal(c.events[0].text, "from aggregator");
  assert.equal(d.error, "not_found");
  // the shop knew the first number, so nobody else was asked about it
  assert.ok(!asked.includes("flashApi:TH0915EKX18T2D"));
  assert.ok(asked.includes("aggregator:TH3333333333AB"));
});

test("env: all providers, hooks for marketplaces", () => {
  const env = {
    FLASH_MCH_ID: "m",
    FLASH_API_KEY: "k",
    NINJAVAN_CLIENT_ID: "c",
    NINJAVAN_CLIENT_SECRET: "s",
    JT_API_ACCOUNT: "a",
    JT_PRIVATE_KEY: "p",
    DHL_ECOMMERCE_CLIENT_ID: "c",
    DHL_ECOMMERCE_PASSWORD: "p",
    THAILAND_POST_TOKEN: "t",
    TRACK17_API_KEY: "k",
    TRACK123_API_SECRET: "s",
    AFTERSHIP_API_KEY: "a",
    SHIP24_API_KEY: "z",
    TRACKINGMORE_API_KEY: "m",
  };
  assert.deepEqual(createTrackerFromEnv(env).providers, [
    "flash",
    "ninjaVan",
    "jt",
    "dhlEcommerce",
    "thailandPost",
    "trackingMore",
    "track17",
    "track123",
    "afterShip",
    "ship24",
  ]);

  // a half-set provider is reported, not silently skipped
  assert.deepEqual(checkEnv({ FLASH_MCH_ID: "m" }).incomplete, [{ name: "flash", missing: ["FLASH_API_KEY"] }]);
  assert.throws(() => createTrackerFromEnv({ FLASH_MCH_ID: "m" }), /flash \(missing FLASH_API_KEY\)/);

  // marketplaces need their functions in code
  const shopeeEnv = { SHOPEE_PARTNER_ID: "1", SHOPEE_PARTNER_KEY: "k" };
  assert.throws(() => createTrackerFromEnv(shopeeEnv), /hooks\.shopee\.findOrder\(\)/);
  const t = createTrackerFromEnv(shopeeEnv, { hooks: { shopee: { findOrder: async () => null, getAccessToken: async () => "t" } } });
  assert.deepEqual(t.providers, ["shopee"]);
});
