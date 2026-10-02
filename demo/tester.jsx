// "ลองกับ API จริง": type a provider's keys, enter real tracking numbers and see what comes back.
//   In the browser  for APIs that allow calls from web pages (CORS): the keys go straight to that API
//   Local server    for the rest, through `npm run playground` (/api/track on this machine); the keys
//                   typed here go only to localhost, or leave them empty to use .env.local
// Keys are kept in memory only: nothing is saved, and closing the tab forgets them.
import React, { useEffect, useMemo, useState } from "react";
import { DeliveryStatus } from "../src/index.js";
import { createTracker } from "../src/server.js";
import { ENV_PROVIDERS } from "../src/providers/env.js";
import { getCarrier } from "../src/core.js";

const BASE = import.meta.env.BASE_URL;

/** APIs whose CORS headers let a web page call them (checked with a preflight, October 2026). */
const BROWSER_OK = new Set(["thailandPost", "lazada", "trackingMore", "track123", "ship24"]);

const MARKETPLACES = new Set(["shopee", "lazada", "tiktokShop"]);

const KIND_LABEL = { carrier: "API ของขนส่ง", marketplace: "Marketplace", post: "ไปรษณีย์", aggregator: "Aggregator" };

const ERROR_HINTS = {
  not_found: "ไม่พบเลขนี้ (เลขผิด ยังไม่เข้าระบบ หรือไม่ใช่พัสดุของบัญชีนี้)",
  unsupported: "provider นี้ไม่รองรับขนส่งของเลขนี้ ลองเลือกขนส่งที่ป้าย",
  invalid: "รูปแบบเลขไม่ถูกต้อง",
  provider_error: "เรียก API ไม่สำเร็จ ดูรายละเอียดด้านล่าง",
};

/** The carrier's own API, if the package has one. */
const OWN_API = { "thailand-post": "thailandPost", flash: "flash", ninjavan: "ninjaVan", jt: "jt", "dhl-ecommerce": "dhlEcommerce" };

/** Providers that can track this carrier, cheapest first (marketplaces left out: they need an order id). */
const providersFor = (carrierId) => {
  const c = getCarrier(carrierId);
  if (!c) return [];
  const names = [
    OWN_API[c.id],
    c.eTrackings && "eTrackings",
    c.trackingMore && "trackingMore",
    c.track17 && "track17",
    c.track123 && "track123",
    c.afterShip && "afterShip",
    "ship24",
  ].filter(Boolean);
  return names.map((n) => ENV_PROVIDERS.find((p) => p.name === n));
};

/** "eTrackings ไม่รองรับ ไปรษณีย์ไทย ลองเลือก provider: Thailand Post, …" */
const UnsupportedHint = ({ shipment, provider, onPick }) => {
  const carrier = getCarrier(shipment.carrier);
  const short = provider.title.replace(/\s*\(.*\)$/, "");
  if (!carrier) return <span className="tester-detail">ไม่รู้ว่าเลขนี้เป็นขนส่งไหน เลือกขนส่งที่ป้ายของเลข แล้วกดตรวจอีกครั้ง</span>;
  const others = providersFor(carrier.id).filter((p) => p.name !== provider.name);
  return (
    <span className="tester-detail">
      เลขนี้เป็นของ {carrier.th} ซึ่ง {short} ไม่รองรับ (ไม่เสียโควตา เพราะไม่ได้ส่งไป)
      {others.length > 0 && (
        <>
          {" "}
          ลองเลือก provider:{" "}
          {others.map((p, i) => (
            <React.Fragment key={p.name}>
              {i > 0 && ", "}
              <button type="button" className="tester-pick" onClick={() => onPick(p.name)}>
                {p.title.replace(/\s*\(.*\)$/, "")}
              </button>
            </React.Fragment>
          ))}
        </>
      )}
    </span>
  );
};

/** What came back, per number: enough to tell whether the keys work. */
const Raw = ({ result, provider, onPick }) => {
  if (!result) return null;
  if (result.error) {
    return (
      <div className="tester-raw tester-raw--bad">
        <b>เรียกไม่สำเร็จ</b>
        <pre className="json">{result.error}</pre>
      </div>
    );
  }
  return (
    <div className="tester-raw">
      <dl className="formats compact">
        {result.shipments.map((s) => (
          <div key={s.number}>
            <dt>{s.number}</dt>
            <dd>
              {s.error ? (
                <span className="hint bad">
                  {s.error}: {s.error === "unsupported" ? "provider นี้ไม่รองรับขนส่งของเลขนี้" : ERROR_HINTS[s.error]}
                  {s.error === "unsupported" && <UnsupportedHint shipment={s} provider={provider} onPick={onPick} />}
                  {/rejected the token/.test(s.detail ?? "") && <span className="tester-detail">token ไม่ถูกต้องหรือถูกยกเลิก ตรวจว่าคัดลอกมาครบ</span>}
                  {/Failed to fetch|NetworkError|Load failed/i.test(s.detail ?? "") && (
                    <span className="tester-detail">เบราว์เซอร์ส่งไม่ถึง API (ถูกบล็อกหรือเน็ตมีปัญหา) ลองผ่าน server ในเครื่อง</span>
                  )}
                  {s.detail && <code className="tester-detail">{s.detail}</code>}
                </span>
              ) : (
                <span className="hint ok">
                  ✓ {s.status}, {s.events.length} เหตุการณ์ ({s.carrier})
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>ข้อมูลทั้งหมดที่ได้ (JSON)</summary>
        <pre className="json">{JSON.stringify(result.shipments, null, 2)}</pre>
      </details>
    </div>
  );
};

const LocalSteps = ({ onRetry }) => (
  <div className="tester-blocked">
    <p className="note">
      API นี้ไม่ยอมให้หน้าเว็บเรียกตรง (CORS) จึงต้องทดสอบผ่าน server เปิดในเครื่องตัวเองได้ใน 3 คำสั่ง แล้วกลับมาพิมพ์ key ในหน้านี้ได้เลย key จะส่งไปแค่ server
      ในเครื่องคุณ
    </p>
    <ol className="tester-steps">
      <li>
        <code>git clone https://github.com/mongkontep/delivery-status</code>
      </li>
      <li>
        <code>cd delivery-status && npm install</code>
      </li>
      <li>
        <code>npm run playground</code> หน้านี้จะเปิดขึ้นในเครื่อง (localhost) แล้วฟอร์มนี้ใช้ได้ทุก provider
      </li>
    </ol>
    <button type="button" className="try" onClick={onRetry}>
      เปิด server แล้ว ลองหาอีกครั้ง
    </button>
  </div>
);

export const Tester = () => {
  const [name, setName] = useState("thailandPost");
  const [values, setValues] = useState({}); // per provider name: { ENV_KEY: value }
  const [show, setShow] = useState(false);
  const [orders, setOrders] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [local, setLocal] = useState(null); // the playground server's answer, or null
  const [result, setResult] = useState(null);

  const provider = ENV_PROVIDERS.find((p) => p.name === name);
  const typed = values[name] ?? {};
  const required = provider.env.filter((v) => v.required);
  const filled = required.every((v) => typed[v.key]?.trim());
  const isMarketplace = MARKETPLACES.has(name);

  const checkLocal = () =>
    fetch(`${BASE}api/playground`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLocal(d?.ok ? d : null))
      .catch(() => setLocal(null));
  useEffect(() => {
    checkLocal();
  }, []);

  // browser where the API allows it, else the local server when it runs
  const route = BROWSER_OK.has(name) ? "browser" : local ? "local" : "blocked";
  const fromEnvFile = route === "local" && !filled && local.enabled.some((p) => p.name === name);

  // "TH123 2410ABC" per line → { TH123: "2410ABC" }, for the marketplaces
  const orderMap = useMemo(
    () =>
      Object.fromEntries(
        orders
          .split("\n")
          .map((l) => l.trim().split(/[\s,=:]+/))
          .filter((p) => p.length >= 2 && p[0] && p[1])
          .map(([n, o]) => [n.toUpperCase(), o]),
      ),
    [orders],
  );

  const env = Object.fromEntries(Object.entries(typed).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v.trim()]));
  const hooks = { findOrder: (n) => (orderMap[n] ? { orderId: orderMap[n] } : null), getAccessToken: () => accessToken.trim() };

  // a fresh tracker for every set of keys, so a wrong key is not cached
  const browserTracker = useMemo(() => {
    if (route !== "browser" || !filled) return null;
    try {
      return createTracker({ providers: [{ ...provider.create(env, undefined, hooks), name }], cacheSeconds: 0 });
    } catch (e) {
      return { error: e.message };
    }
  }, [route, filled, name, JSON.stringify(env), JSON.stringify(orderMap), accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const track = async (items) => {
    try {
      let shipments;
      if (route === "browser") {
        shipments = await browserTracker.track(items);
      } else {
        const res = await fetch(`${BASE}api/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, provider: name, env: fromEnvFile ? null : env, orders: orderMap, accessToken: accessToken.trim() || null }),
        });
        const data = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        if (!res.ok) throw new Error(data.message ?? data.error);
        shipments = data.shipments;
      }
      setResult({ shipments });
      return shipments;
    } catch (e) {
      setResult({ error: e.message });
      throw e;
    }
  };

  const set = (key, value) => {
    setValues({ ...values, [name]: { ...typed, [key]: value } });
    setResult(null);
  };

  const ready = route === "browser" ? browserTracker && !browserTracker.error : route === "local" && (filled || fromEnvFile);

  return (
    <section className="example" id="tester">
      <div className="example-head">
        <h2>ลองกับ API จริง</h2>
        <p>เลือก provider แล้วพิมพ์ key ลงช่องด้านล่าง กรอกเลขพัสดุจริงแล้วกดตรวจสอบ ใต้ช่องกรอกจะบอกผลของแต่ละเลขว่าเจอหรือติดตรงไหน</p>
      </div>

      <div className="tester-body">
        <label className="field fill">
          Provider
          <select
            className="text-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setResult(null);
            }}
          >
            {Object.entries(KIND_LABEL).map(([kind, label]) => (
              <optgroup key={kind} label={label}>
                {ENV_PROVIDERS.filter((p) => p.kind === kind).map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.title}
                    {BROWSER_OK.has(p.name) ? "" : " · ต้องใช้ server ในเครื่อง"}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <p className={`tester-route tester-route--${route}`}>
          {route === "browser" && "ส่งตรงจากเบราว์เซอร์ไปที่ API ของเจ้านี้ ไม่ผ่าน server ของเรา"}
          {route === "local" && "ส่งผ่าน server ในเครื่องคุณ (npm run playground) key ไปแค่ localhost"}
          {route === "blocked" && "เจ้านี้ทดสอบจากหน้าเว็บตรง ๆ ไม่ได้ ต้องใช้ server ในเครื่อง"}
        </p>

        {route === "blocked" ? (
          <LocalSteps onRetry={checkLocal} />
        ) : (
          <>
            <div className="tester-grid">
              {provider.env.map((v) => (
                <label key={v.key} className="field">
                  <span>
                    {v.key}
                    {!v.required && <span className="tester-optional"> (ไม่บังคับ)</span>}
                  </span>
                  <input
                    className="text-input tester-key"
                    type={show || !v.required ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={v.note}
                    value={typed[v.key] ?? ""}
                    onChange={(e) => set(v.key, e.target.value)}
                  />
                </label>
              ))}
              {isMarketplace && (
                <label className="field">
                  access token ของร้าน
                  <input
                    className="text-input tester-key"
                    type={show ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </label>
              )}
            </div>
            {isMarketplace && (
              <label className="field fill">
                เลขพัสดุ → เลขคำสั่งซื้อ (marketplace ค้นจากเลขคำสั่งซื้อ บรรทัดละคู่)
                <textarea className="text-input payload-input" rows={2} placeholder="TH012345678912A 241002ABCDEF" value={orders} onChange={(e) => setOrders(e.target.value)} />
              </label>
            )}
            <div className="tester-row">
              <button type="button" className="try" onClick={() => setShow(!show)}>
                {show ? "ซ่อน key" : "แสดง key"}
              </button>
              {fromEnvFile && <span className="hint ok">ไม่ได้พิมพ์ key: ใช้ค่าจาก .env.local</span>}
              {browserTracker?.error && <span className="hint bad">{browserTracker.error}</span>}
            </div>
            <p className="note hint-note">
              key อยู่ในแท็บนี้เท่านั้น ไม่ถูกบันทึก ปิดแท็บแล้วหายไป
              {name === "thailandPost" && (
                <>
                  {" "}
                  ยังไม่มี token?{" "}
                  <a href="https://track.thailandpost.co.th/developerGuide" target="_blank" rel="noreferrer">
                    สมัครฟรีที่ไปรษณีย์ไทย
                  </a>
                </>
              )}
            </p>
            {ready ? (
              <DeliveryStatus key={name} className="fill" track={track} />
            ) : (
              <p className="tester-empty">ใส่ key ที่ไม่ได้เขียนว่า (ไม่บังคับ) ให้ครบ แล้วช่องกรอกเลขพัสดุจะขึ้นตรงนี้</p>
            )}
            <Raw
              result={result}
              provider={provider}
              onPick={(next) => {
                setName(next);
                setResult(null);
              }}
            />
          </>
        )}
      </div>
    </section>
  );
};
