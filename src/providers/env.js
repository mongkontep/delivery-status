// Which provider each set of environment variables switches on. The order here is the order a
// number is tried in: a carrier's own API first, then the marketplaces, then Thailand Post, then
// the paid aggregators (asked only when nothing before them had the parcel).
import { afterShip, ship24, track123, track17 } from "./aggregators.js";
import { dhlEcommerce } from "./dhl-ecommerce.js";
import { flash } from "./flash.js";
import { jt } from "./jt.js";
import { lazada, shopee, tiktokShop } from "./marketplaces.js";
import { ninjaVan } from "./ninjavan.js";
import { thailandPost } from "./thailand-post.js";
import { trackingMore } from "./trackingmore.js";
import { TrackingError } from "./util.js";

const yes = (v) => /^(1|true|yes|on)$/i.test(String(v ?? "").trim());

/**
 * name      provider name (also what `tracker.providers` lists)
 * kind      "carrier" (a carrier's own API), "marketplace", "post" or "aggregator"
 * env       variables: required ones switch the provider on, optional ones tune it
 * hooks     functions that must be passed in code (createTrackerFromEnv(env, { hooks: { name: {...} } }))
 * create    builds the provider
 */
export const ENV_PROVIDERS = [
  {
    name: "flash",
    kind: "carrier",
    title: "Flash Express",
    env: [
      { key: "FLASH_MCH_ID", required: true, note: "merchant number (mchId), from Flash staff" },
      { key: "FLASH_API_KEY", required: true, note: "API key for signing" },
      { key: "FLASH_SANDBOX", note: "true for the training system" },
    ],
    create: (e, fetch) => flash({ mchId: e.FLASH_MCH_ID, key: e.FLASH_API_KEY, sandbox: yes(e.FLASH_SANDBOX), fetch }),
  },
  {
    name: "ninjaVan",
    kind: "carrier",
    title: "Ninja Van",
    env: [
      { key: "NINJAVAN_CLIENT_ID", required: true, note: "Ninja Dashboard → Settings → IT Settings" },
      { key: "NINJAVAN_CLIENT_SECRET", required: true, note: "the Client Key shown with it" },
      { key: "NINJAVAN_COUNTRY", note: "th (default)" },
      { key: "NINJAVAN_SANDBOX", note: "true for sandbox" },
    ],
    create: (e, fetch) =>
      ninjaVan({ clientId: e.NINJAVAN_CLIENT_ID, clientSecret: e.NINJAVAN_CLIENT_SECRET, country: e.NINJAVAN_COUNTRY || "th", sandbox: yes(e.NINJAVAN_SANDBOX), fetch }),
  },
  {
    name: "jt",
    kind: "carrier",
    title: "J&T Express",
    env: [
      { key: "JT_API_ACCOUNT", required: true, note: "apiAccount of a certified J&T open-platform account" },
      { key: "JT_PRIVATE_KEY", required: true, note: "privateKey issued with it" },
      { key: "JT_BASE_URL", note: "API root if J&T Thailand gives you a different one" },
      { key: "JT_SANDBOX", note: "true for the demo system" },
    ],
    create: (e, fetch) => jt({ apiAccount: e.JT_API_ACCOUNT, privateKey: e.JT_PRIVATE_KEY, baseUrl: e.JT_BASE_URL || undefined, sandbox: yes(e.JT_SANDBOX), fetch }),
  },
  {
    name: "dhlEcommerce",
    kind: "carrier",
    title: "DHL eCommerce Asia",
    env: [
      { key: "DHL_ECOMMERCE_CLIENT_ID", required: true, note: "clientId from DHL eCommerce Asia" },
      { key: "DHL_ECOMMERCE_PASSWORD", required: true, note: "API password" },
      { key: "DHL_ECOMMERCE_SOLDTO_ACCOUNT", note: "soldTo account id (more detail in answers)" },
      { key: "DHL_ECOMMERCE_PICKUP_ACCOUNT", note: "pickup account id" },
      { key: "DHL_ECOMMERCE_SANDBOX", note: "true for the pre-production system" },
    ],
    create: (e, fetch) =>
      dhlEcommerce({
        clientId: e.DHL_ECOMMERCE_CLIENT_ID,
        password: e.DHL_ECOMMERCE_PASSWORD,
        soldToAccountId: e.DHL_ECOMMERCE_SOLDTO_ACCOUNT || undefined,
        pickupAccountId: e.DHL_ECOMMERCE_PICKUP_ACCOUNT || undefined,
        sandbox: yes(e.DHL_ECOMMERCE_SANDBOX),
        fetch,
      }),
  },
  {
    name: "shopee",
    kind: "marketplace",
    title: "Shopee Open Platform",
    env: [
      { key: "SHOPEE_PARTNER_ID", required: true, note: "partner_id of your app" },
      { key: "SHOPEE_PARTNER_KEY", required: true, note: "partner_key" },
      { key: "SHOPEE_SHOP_ID", note: "shop_id, unless findOrder returns it" },
      { key: "SHOPEE_SANDBOX", note: "true for the test host" },
    ],
    hooks: ["findOrder", "getAccessToken"],
    create: (e, fetch, h) =>
      shopee({ partnerId: e.SHOPEE_PARTNER_ID, partnerKey: e.SHOPEE_PARTNER_KEY, shopId: e.SHOPEE_SHOP_ID || undefined, sandbox: yes(e.SHOPEE_SANDBOX), fetch, ...h }),
  },
  {
    name: "lazada",
    kind: "marketplace",
    title: "Lazada Open Platform",
    env: [
      { key: "LAZADA_APP_KEY", required: true, note: "app_key" },
      { key: "LAZADA_APP_SECRET", required: true, note: "app_secret" },
    ],
    hooks: ["findOrder", "getAccessToken"],
    create: (e, fetch, h) => lazada({ appKey: e.LAZADA_APP_KEY, appSecret: e.LAZADA_APP_SECRET, fetch, ...h }),
  },
  {
    name: "tiktokShop",
    kind: "marketplace",
    title: "TikTok Shop",
    env: [
      { key: "TIKTOK_SHOP_APP_KEY", required: true, note: "app_key" },
      { key: "TIKTOK_SHOP_APP_SECRET", required: true, note: "app_secret" },
      { key: "TIKTOK_SHOP_CIPHER", note: "shop_cipher (cross-border shops)" },
    ],
    hooks: ["findOrder", "getAccessToken"],
    create: (e, fetch, h) =>
      tiktokShop({ appKey: e.TIKTOK_SHOP_APP_KEY, appSecret: e.TIKTOK_SHOP_APP_SECRET, shopCipher: e.TIKTOK_SHOP_CIPHER || undefined, fetch, ...h }),
  },
  {
    name: "thailandPost",
    kind: "post",
    title: "Thailand Post (ไปรษณีย์ไทย)",
    env: [
      { key: "THAILAND_POST_TOKEN", required: true, note: "free token from https://track.thailandpost.co.th/developerGuide" },
      { key: "THAILAND_POST_LANGUAGE", note: "TH (default), EN or CN" },
    ],
    create: (e, fetch) => thailandPost({ token: e.THAILAND_POST_TOKEN, language: e.THAILAND_POST_LANGUAGE || undefined, fetch }),
  },
  {
    name: "trackingMore",
    kind: "aggregator",
    title: "TrackingMore",
    env: [{ key: "TRACKINGMORE_API_KEY", required: true, note: "https://www.trackingmore.com" }],
    create: (e, fetch) => trackingMore({ apiKey: e.TRACKINGMORE_API_KEY, fetch }),
  },
  {
    name: "track17",
    kind: "aggregator",
    title: "17TRACK",
    env: [{ key: "TRACK17_API_KEY", required: true, note: "17token from https://api.17track.net" }],
    create: (e, fetch) => track17({ apiKey: e.TRACK17_API_KEY, fetch }),
  },
  {
    name: "track123",
    kind: "aggregator",
    title: "Track123",
    env: [{ key: "TRACK123_API_SECRET", required: true, note: "https://www.track123.com" }],
    create: (e, fetch) => track123({ apiSecret: e.TRACK123_API_SECRET, fetch }),
  },
  {
    name: "afterShip",
    kind: "aggregator",
    title: "AfterShip",
    env: [{ key: "AFTERSHIP_API_KEY", required: true, note: "https://www.aftership.com" }],
    create: (e, fetch) => afterShip({ apiKey: e.AFTERSHIP_API_KEY, fetch }),
  },
  {
    name: "ship24",
    kind: "aggregator",
    title: "Ship24",
    env: [{ key: "SHIP24_API_KEY", required: true, note: "https://www.ship24.com" }],
    create: (e, fetch) => ship24({ apiKey: e.SHIP24_API_KEY, fetch }),
  },
];

const defaultEnv = () => (typeof process !== "undefined" && process.env ? process.env : {});

/**
 * Which providers the variables switch on, and which are half set up.
 * `{ enabled: ["thailandPost"], incomplete: [{ name, missing: ["FLASH_API_KEY"] }] }`
 * Hooks are checked too when `hooks` is passed.
 */
export const checkEnv = (env = defaultEnv(), hooks) => {
  const enabled = [];
  const incomplete = [];
  for (const p of ENV_PROVIDERS) {
    const required = p.env.filter((v) => v.required).map((v) => v.key);
    const set = required.filter((k) => env[k]);
    if (!set.length) continue;
    const missing = required.filter((k) => !env[k]);
    if (hooks && p.hooks) missing.push(...p.hooks.filter((h) => typeof hooks[p.name]?.[h] !== "function").map((h) => `hooks.${p.name}.${h}()`));
    if (missing.length) incomplete.push({ name: p.name, missing });
    else enabled.push(p.name);
  }
  return { enabled, incomplete };
};

/** The providers switched on by `env`. Throws when a provider is only half set up. */
export const providersFromEnv = (env = defaultEnv(), fetchFn, hooks = {}) => {
  const { enabled, incomplete } = checkEnv(env, hooks);
  if (incomplete.length) {
    const list = incomplete.map((i) => `${i.name} (missing ${i.missing.join(", ")})`).join("; ");
    throw new TrackingError("config", `Incomplete tracking settings: ${list}`, incomplete);
  }
  return ENV_PROVIDERS.filter((p) => enabled.includes(p.name)).map((p) => ({ ...p.create(env, fetchFn, hooks[p.name] ?? {}), name: p.name }));
};
