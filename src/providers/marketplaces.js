// Marketplace seller APIs: Shopee, Lazada and TikTok Shop.
// None of them looks a parcel up by tracking number, only by their own order id, and their access
// tokens expire within hours. So besides the keys in .env, each needs two functions in code:
//   findOrder(number)          → { orderId, packageId?, shopId? } for a tracking number, or null
//                                 (your own orders table usually has this)
//   getAccessToken({ shopId })  → a current access token (you store and refresh it; the refresh
//                                 helpers below do the signed call)
// A number findOrder does not know is passed on to the next provider.
import { statusFromText } from "../status.js";
import { TrackingError, hmacSha256Hex, mapLimit, readJson } from "./util.js";

/** Marketplace status names (SHOUTING_CASE) → our statuses, by the words in them. */
export const marketplaceStatus = (code) => {
  const c = String(code ?? "").toUpperCase();
  if (!c) return null;
  if (/RETURN/.test(c)) return "returned";
  if (/FAIL/.test(c)) return "failed_attempt";
  if (/DELIVERED|DELIVERY_DONE|COMPLETE/.test(c)) return "delivered";
  if (/OUT_FOR_DELIVERY|DELIVERING|LAST_MILE/.test(c)) return "out_for_delivery";
  if (/LOST|CANCEL|INVALID|REJECT|EXCEPTION|DAMAGE/.test(c)) return "exception";
  if (/PICKUP_DONE|PICKED|SHIPPED|HANDOVER/.test(c)) return "accepted";
  if (/NOT_START|READY|PENDING|CREATED|ARRANGE|UNPAID/.test(c)) return "info_received";
  if (/TRANSIT|SORT|HUB|ARRIV|DEPART/.test(c)) return "in_transit";
  return null;
};

/** Shared shape: look up each number's order, then fetch its tracking. */
const marketplace = (name, { findOrder, getAccessToken, concurrency = 4 }, fetchTrace) => {
  if (typeof findOrder !== "function") throw new TrackingError("config", `${name} needs \`findOrder(number)\` passed in code`);
  if (typeof getAccessToken !== "function") throw new TrackingError("config", `${name} needs \`getAccessToken({ shopId })\` passed in code`);
  return {
    name,
    // a marketplace order can go with any carrier
    anyCarrier: true,
    async track(items) {
      const numbers = [...new Set(items.map((i) => i.number))];
      const found = new Map(
        await mapLimit(numbers, concurrency, async (number) => {
          try {
            const order = await findOrder(number);
            if (!order?.orderId) return [number, { error: "not_found" }];
            const token = await getAccessToken({ shopId: order.shopId });
            return [number, await fetchTrace(number, order, token)];
          } catch (e) {
            return [number, { error: "provider_error", detail: e.message }];
          }
        }),
      );
      return items.map((it) => {
        const r = found.get(it.number);
        if (r.error) return { number: it.number, carrier: it.carrier, error: r.error, events: [], detail: r.detail };
        if (!r.events.length) return { number: it.number, carrier: it.carrier, error: "not_found", events: [] };
        return { number: it.number, carrier: it.carrier, ...r };
      });
    },
  };
};

/* ---------------------------------------------------------------- Shopee */

const SHOPEE = { production: "https://partner.shopeemobile.com", sandbox: "https://partner.test-stable.shopeemobile.com" };

/** Shop-level sign: HMAC-SHA256(partner_key, partner_id + path + timestamp + access_token + shop_id), hex. */
export const shopeeSign = (partnerKey, parts) => hmacSha256Hex(partnerKey, parts.join(""));

/**
 * Shopee Open Platform v2 (logistics.get_tracking_info).
 * .env: SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_SHOP_ID (or shopId from findOrder), SHOPEE_SANDBOX
 */
export const shopee = ({ partnerId, partnerKey, shopId, sandbox = false, fetch: fetchFn = globalThis.fetch, ...hooks } = {}) => {
  if (!partnerId || !partnerKey) throw new TrackingError("config", "shopee needs `partnerId` and `partnerKey`");
  const host = sandbox ? SHOPEE.sandbox : SHOPEE.production;
  const path = "/api/v2/logistics/get_tracking_info";
  return marketplace("shopee", hooks, async (number, order, accessToken) => {
    const shop = String(order.shopId ?? shopId ?? "");
    if (!shop) throw new TrackingError("config", "shopee needs a shop id (SHOPEE_SHOP_ID or shopId from findOrder)");
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = await shopeeSign(partnerKey, [partnerId, path, timestamp, accessToken, shop]);
    const q = new URLSearchParams({ partner_id: String(partnerId), timestamp: String(timestamp), access_token: accessToken, shop_id: shop, sign, order_sn: order.orderId });
    if (order.packageId) q.set("package_number", order.packageId);
    const data = await readJson(await fetchFn(`${host}${path}?${q}`));
    if (data.error) throw new TrackingError("provider_error", data.message || data.error, data);
    const r = data.response ?? {};
    const events = (r.tracking_info ?? []).map((e) => ({
      time: e.update_time ? new Date(e.update_time * 1000).toISOString() : null,
      status: marketplaceStatus(e.logistics_status) ?? statusFromText(e.description) ?? "in_transit",
      text: e.description ?? "",
      code: e.logistics_status,
    }));
    return { status: marketplaceStatus(r.logistics_status) ?? undefined, events };
  });
};

/**
 * Exchanges a Shopee refresh token (30 days, single use) for a new pair. Store both again.
 * Returns { accessToken, refreshToken, expiresIn }.
 */
export const shopeeRefreshToken = async ({ partnerId, partnerKey, shopId, refreshToken, sandbox = false, fetch: fetchFn = globalThis.fetch }) => {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await shopeeSign(partnerKey, [partnerId, path, timestamp]);
  const q = new URLSearchParams({ partner_id: String(partnerId), timestamp: String(timestamp), sign });
  const res = await fetchFn(`${sandbox ? SHOPEE.sandbox : SHOPEE.production}${path}?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken, partner_id: Number(partnerId), shop_id: Number(shopId) }),
  });
  const data = await readJson(res);
  if (data.error || !data.access_token) throw new TrackingError("provider_error", data.message || data.error || "Shopee did not refresh the token", data);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expire_in };
};

/* ---------------------------------------------------------------- Lazada */

const LAZADA_API = "https://api.lazada.co.th/rest";
const LAZADA_AUTH = "https://auth.lazada.com/rest";

/** Sign: api path + every param but `sign`, sorted, as key+value; HMAC-SHA256(app_secret), upper-case hex. */
export const lazadaSign = async (appSecret, path, params) => {
  const base = path + Object.keys(params).filter((k) => k !== "sign").sort().map((k) => `${k}${params[k]}`).join("");
  return (await hmacSha256Hex(appSecret, base)).toUpperCase();
};

const lazadaCall = async (fetchFn, root, path, appKey, appSecret, extra) => {
  const params = { app_key: String(appKey), timestamp: String(Date.now()), sign_method: "sha256", ...extra };
  params.sign = await lazadaSign(appSecret, path, params);
  const data = await readJson(await fetchFn(`${root}${path}?${new URLSearchParams(params)}`));
  if (String(data.code) !== "0") throw new TrackingError("provider_error", data.message || `Lazada code ${data.code}`, data);
  return data;
};

/**
 * Lazada Open Platform (GetOrderTrace).
 * .env: LAZADA_APP_KEY, LAZADA_APP_SECRET
 */
export const lazada = ({ appKey, appSecret, locale, fetch: fetchFn = globalThis.fetch, ...hooks } = {}) => {
  if (!appKey || !appSecret) throw new TrackingError("config", "lazada needs `appKey` and `appSecret`");
  return marketplace("lazada", hooks, async (number, order, accessToken) => {
    const data = await lazadaCall(fetchFn, LAZADA_API, "/logistic/order/trace", appKey, appSecret, {
      access_token: accessToken,
      order_id: String(order.orderId),
      ...(locale && { locale }),
    });
    const packages = (data.result?.module ?? []).flatMap((m) => m.package_detail_info_list ?? []);
    const pkg = packages.find((p) => String(p.tracking_number ?? "").toUpperCase() === number) ?? packages[0];
    const events = (pkg?.logistic_detail_info_list ?? []).map((e) => ({
      time: e.event_time ? new Date(Number(e.event_time)).toISOString() : null,
      status: marketplaceStatus(e.detail_type) ?? statusFromText(`${e.title ?? ""} ${e.description ?? ""}`) ?? "in_transit",
      text: [e.title, e.description].filter(Boolean).join(" · "),
      location: e.package_location_name ?? "",
      code: e.status_code,
    }));
    return { events };
  });
};

/** Exchanges a Lazada refresh token for a new pair. Returns { accessToken, refreshToken, expiresIn, refreshExpiresIn }. */
export const lazadaRefreshToken = async ({ appKey, appSecret, refreshToken, fetch: fetchFn = globalThis.fetch }) => {
  const data = await lazadaCall(fetchFn, LAZADA_AUTH, "/auth/token/refresh", appKey, appSecret, { refresh_token: refreshToken });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in),
    refreshExpiresIn: Number(data.refresh_expires_in),
  };
};

/* ---------------------------------------------------------------- TikTok Shop */

const TIKTOK = "https://open-api.tiktokglobalshop.com";

/** Sign: app_secret + path + sorted params (minus sign, access_token) as key+value + body + app_secret; HMAC-SHA256(app_secret), hex. */
export const tiktokSign = (appSecret, path, params, body = "") => {
  const base = path + Object.keys(params).filter((k) => k !== "sign" && k !== "access_token").sort().map((k) => `${k}${params[k]}`).join("") + body;
  return hmacSha256Hex(appSecret, appSecret + base + appSecret);
};

/**
 * TikTok Shop Partner API (fulfillment GetTracking).
 * .env: TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET, TIKTOK_SHOP_CIPHER (cross-border shops)
 */
export const tiktokShop = ({ appKey, appSecret, shopCipher, fetch: fetchFn = globalThis.fetch, ...hooks } = {}) => {
  if (!appKey || !appSecret) throw new TrackingError("config", "tiktokShop needs `appKey` and `appSecret`");
  return marketplace("tiktokShop", hooks, async (number, order, accessToken) => {
    const path = `/fulfillment/202309/orders/${encodeURIComponent(order.orderId)}/tracking`;
    const params = { app_key: String(appKey), timestamp: String(Math.floor(Date.now() / 1000)) };
    const cipher = order.shopCipher ?? shopCipher;
    if (cipher) params.shop_cipher = cipher;
    params.sign = await tiktokSign(appSecret, path, params);
    const res = await fetchFn(`${TIKTOK}${path}?${new URLSearchParams(params)}`, {
      headers: { "x-tts-access-token": accessToken, "Content-Type": "application/json" },
    });
    const data = await readJson(res);
    if (data.code !== 0) throw new TrackingError("provider_error", data.message || `TikTok Shop code ${data.code}`, data);
    const events = (data.data?.tracking ?? []).map((e) => ({
      time: e.update_time_millis ? new Date(Number(e.update_time_millis)).toISOString() : null,
      status: statusFromText(e.description) ?? "in_transit",
      text: e.description ?? "",
    }));
    return { events };
  });
};
