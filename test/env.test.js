import test from "node:test";
import assert from "node:assert/strict";
import { ENV_PROVIDERS, checkEnv, createTrackerFromEnv } from "../src/server.js";

test("env: providers switch on when their required variables are set", () => {
  assert.deepEqual(checkEnv({}), { enabled: [], incomplete: [] });
  assert.deepEqual(checkEnv({ THAILAND_POST_TOKEN: "t" }).enabled, ["thailandPost"]);
  const t = createTrackerFromEnv({ THAILAND_POST_TOKEN: "t", TRACKINGMORE_API_KEY: "k" });
  assert.deepEqual(t.providers, ["thailandPost", "trackingMore"]);
});

test("env: every provider documents its variables", () => {
  const keys = new Set();
  for (const p of ENV_PROVIDERS) {
    assert.ok(p.name && p.title && p.env.some((v) => v.required), p.name);
    for (const v of p.env) {
      assert.match(v.key, /^[A-Z][A-Z0-9_]*$/, v.key);
      assert.ok(!keys.has(v.key), `duplicate ${v.key}`);
      keys.add(v.key);
    }
  }
});

test("env: no providers still gives carrier and link", async () => {
  const t = createTrackerFromEnv({});
  assert.deepEqual(t.providers, []);
  const [s] = await t.track(["KEX20898721369"]);
  assert.equal(s.error, "unsupported");
  assert.equal(s.carrier, "kerry");
  assert.equal(s.url, "https://th.kex-express.com/th/track/?track=KEX20898721369");
});

test("env: custom providers come first", () => {
  const t = createTrackerFromEnv({ THAILAND_POST_TOKEN: "t" }, { providers: [{ name: "mine", carriers: ["kerry"], track: async () => [] }] });
  assert.deepEqual(t.providers, ["mine", "thailandPost"]);
});

test("env: .env.example lists every variable", async () => {
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  for (const p of ENV_PROVIDERS) for (const v of p.env) assert.match(text, new RegExp(`^${v.key}=$`, "m"), `${v.key} (run npm run env:example)`);
});
