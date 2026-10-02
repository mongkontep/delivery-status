// `npm run playground`: the demo page plus a real /api/track on your own machine, set up from
// .env.local (or .env) in the package folder. Keys stay on your machine; nothing here is deployed.
// The .env file is read again on every request, so edits apply without a restart.
//
// The tester on the page sends { items, provider, env, orders, accessToken }: the keys typed on the
// page (env), or env: null to use .env.local. Only the chosen provider is tried, so each one can be
// checked on its own. Marketplaces get the order ids from `orders` and the token from `accessToken`
// (or SHOPEE_ACCESS_TOKEN, LAZADA_ACCESS_TOKEN, TIKTOK_SHOP_ACCESS_TOKEN in .env.local).
import { loadEnv } from "vite";
import { ENV_PROVIDERS, checkEnv, createTracker, createTrackerFromEnv } from "../src/server.js";

const MARKETPLACE_TOKENS = { shopee: "SHOPEE_ACCESS_TOKEN", lazada: "LAZADA_ACCESS_TOKEN", tiktokShop: "TIKTOK_SHOP_ACCESS_TOKEN" };

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

export const playground = () => ({
  name: "delivery-status-playground",
  apply: "serve",
  configureServer(server) {
    const root = process.cwd();
    const env = () => loadEnv("development", root, "");

    const hooksFor = (e, orders, typedToken) =>
      Object.fromEntries(
        Object.entries(MARKETPLACE_TOKENS).map(([name, key]) => [
          name,
          {
            findOrder: (number) => (orders?.[number] ? { orderId: orders[number] } : null),
            getAccessToken: () => {
              const token = typedToken || e[key];
              if (!token) throw new Error(`Type the shop's access token, or set ${key} in .env.local`);
              return token;
            },
          },
        ]),
      );

    server.middlewares.use(async (req, res, next) => {
      const path = (req.url ?? "").split("?")[0];
      try {
        if (path.endsWith("/api/playground")) {
          const e = env();
          const { enabled, incomplete } = checkEnv(e);
          const titles = Object.fromEntries(ENV_PROVIDERS.map((p) => [p.name, p.title]));
          return send(res, 200, {
            ok: true,
            enabled: enabled.map((n) => ({ name: n, title: titles[n] })),
            incomplete: incomplete.map((i) => ({ ...i, title: titles[i.name] })),
            marketplaceTokens: Object.fromEntries(Object.entries(MARKETPLACE_TOKENS).map(([n, k]) => [n, !!e[k]])),
          });
        }
        if (path.endsWith("/api/track") && req.method === "POST") {
          const fileEnv = env();
          const body = JSON.parse((await readBody(req)) || "{}");
          const hooks = hooksFor(fileEnv, body.orders, body.accessToken);
          let tracker;
          const chosen = ENV_PROVIDERS.find((p) => p.name === body.provider);
          if (chosen) {
            // just the provider picked on the page, from the typed keys or else from .env.local
            const e = body.env ?? fileEnv;
            const missing = chosen.env.filter((v) => v.required && !e[v.key]).map((v) => v.key);
            if (missing.length) throw Object.assign(new Error(`Missing ${missing.join(", ")}`), { code: "config" });
            tracker = createTracker({ providers: [{ ...chosen.create(e, undefined, hooks[chosen.name] ?? {}), name: chosen.name }], cacheSeconds: 0 });
          } else {
            tracker = createTrackerFromEnv(fileEnv, { hooks, cacheSeconds: 0 });
          }
          return send(res, 200, { shipments: await tracker.track(body), providers: tracker.providers });
        }
      } catch (err) {
        return send(res, 400, { error: err.code ?? "playground_error", message: err.message });
      }
      next();
    });
  },
});
