// `npm run playground`: the demo page plus a real /api/track on your own machine, set up from
// .env.local (or .env) in the package folder. Keys stay on your machine; nothing here is deployed.
// The .env file is read again on every request, so edits apply without a restart.
//
// Marketplaces (Shopee, Lazada, TikTok Shop) need an order id and an access token: the page sends
// "tracking number → order id" pairs in a header, and the token comes from SHOPEE_ACCESS_TOKEN,
// LAZADA_ACCESS_TOKEN or TIKTOK_SHOP_ACCESS_TOKEN in the same .env file.
import { loadEnv } from "vite";
import { ENV_PROVIDERS, checkEnv, createTrackerFromEnv } from "../src/server.js";

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

    const hooksFor = (e, orders) =>
      Object.fromEntries(
        Object.entries(MARKETPLACE_TOKENS).map(([name, key]) => [
          name,
          {
            findOrder: (number) => (orders[number] ? { orderId: orders[number] } : null),
            getAccessToken: () => {
              if (!e[key]) throw new Error(`Set ${key} in .env.local to test ${name}`);
              return e[key];
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
          const e = env();
          let orders = {};
          try {
            orders = JSON.parse(req.headers["x-playground-orders"] || "{}");
          } catch {}
          const tracker = createTrackerFromEnv(e, { hooks: hooksFor(e, orders), cacheSeconds: 0 });
          const body = JSON.parse((await readBody(req)) || "{}");
          return send(res, 200, { shipments: await tracker.track(body), providers: tracker.providers });
        }
      } catch (err) {
        return send(res, 400, { error: err.code ?? "playground_error", message: err.message });
      }
      next();
    });
  },
});
