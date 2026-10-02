// "ลองกับ API จริง": check real keys and real tracking numbers before wiring up a server.
//   Thailand Post  called straight from this browser tab (its API allows it); the token stays in memory
//   Local server   `npm run playground` serves /api/track from .env.local, so every provider can be tried
import React, { useEffect, useMemo, useState } from "react";
import { DeliveryStatus } from "../src/index.js";
import { createTracker } from "../src/server.js";

const BASE = import.meta.env.BASE_URL;
const TOKEN_PAGE = "https://track.thailandpost.co.th/developerGuide";

const ERROR_HINTS = {
  not_found: "ไม่พบเลขนี้ในระบบของขนส่ง (เลขผิด ยังไม่เข้าระบบ หรือไม่ใช่พัสดุของบัญชีนี้)",
  unsupported: "ยังไม่ได้ตั้งค่า provider ที่ตอบขนส่งนี้ได้",
  invalid: "รูปแบบเลขไม่ถูกต้อง",
  provider_error: "เรียก API ไม่สำเร็จ ดูรายละเอียดด้านล่าง",
};

/** What came back, per number: the parts that tell whether the keys work. */
const Raw = ({ result }) => {
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
                  {s.error}: {ERROR_HINTS[s.error]}
                  {/rejected the token/.test(s.detail ?? "") && <span className="tester-detail">token ไม่ถูกต้องหรือถูกยกเลิก ตรวจว่าคัดลอกมาครบ</span>}
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

/** Thailand Post, straight from the browser. */
const ThailandPostTester = () => {
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [language, setLanguage] = useState("TH");
  const [result, setResult] = useState(null);
  // a new tracker whenever the token changes, so a wrong token is not cached
  const tracker = useMemo(() => (token.trim() ? createTracker({ thailandPost: { token: token.trim(), language }, cacheSeconds: 0 }) : null), [token, language]);

  const track = async (items) => {
    try {
      const shipments = await tracker.track(items);
      setResult({ shipments });
      return shipments;
    } catch (e) {
      setResult({ error: e.message });
      throw e;
    }
  };

  return (
    <div className="tester-body">
      <div className="tester-fields">
        <label className="field">
          Thailand Post API token
          <span className="tester-token">
            <input
              className="text-input"
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder="วาง token จากหน้า dashboard ของไปรษณีย์ไทย"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setResult(null);
              }}
            />
            <button type="button" className="try" onClick={() => setShow(!show)}>
              {show ? "ซ่อน" : "แสดง"}
            </button>
          </span>
        </label>
        <label className="field">
          ภาษา
          <select className="text-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="TH">ไทย</option>
            <option value="EN">English</option>
          </select>
        </label>
      </div>
      <p className="note hint-note">
        token อยู่ในแท็บนี้เท่านั้น ส่งตรงไปที่ trackapi.thailandpost.co.th ไม่ผ่าน server ของเรา และไม่ถูกบันทึก ปิดแท็บแล้วหายไป ยังไม่มี token?{" "}
        <a href={TOKEN_PAGE} target="_blank" rel="noreferrer">
          สมัครฟรีที่ไปรษณีย์ไทย
        </a>
      </p>
      {tracker ? (
        <DeliveryStatus key={token + language} className="fill" track={track} />
      ) : (
        <p className="tester-empty">ใส่ token ก่อน แล้วช่องกรอกเลขพัสดุจะขึ้นตรงนี้</p>
      )}
      <Raw result={result} />
    </div>
  );
};

/** Every provider, through `npm run playground` on this machine. */
const LocalTester = () => {
  const [info, setInfo] = useState(undefined); // undefined: checking, null: not running
  const [orders, setOrders] = useState("");
  const [result, setResult] = useState(null);

  const check = () =>
    fetch(`${BASE}api/playground`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d?.ok ? d : null))
      .catch(() => setInfo(null));
  useEffect(() => {
    check();
  }, []);

  // "TH123 2410ABC" per line → { TH123: "2410ABC" } for the marketplace providers
  const orderMap = Object.fromEntries(
    orders
      .split("\n")
      .map((l) => l.trim().split(/[\s,=:]+/))
      .filter((p) => p.length >= 2 && p[0] && p[1])
      .map(([n, o]) => [n.toUpperCase(), o]),
  );

  const track = async (items) => {
    const res = await fetch(`${BASE}api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-playground-orders": JSON.stringify(orderMap) },
      body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    if (!res.ok) {
      setResult({ error: data.message ?? data.error });
      throw new Error(data.message);
    }
    setResult({ shipments: data.shipments });
    check(); // .env.local may have changed
    return data.shipments;
  };

  if (info === undefined) return <p className="note">กำลังหา server ในเครื่อง…</p>;

  if (info === null) {
    return (
      <div className="tester-body">
        <p className="note">
          ทดสอบ provider อื่น (Flash, J&T, Ninja Van, DHL eCommerce, Shopee, Lazada, TikTok Shop, aggregator) ได้จากเครื่องตัวเอง key อยู่ในไฟล์ .env.local
          ในเครื่อง ไม่ต้องกรอกลงหน้าเว็บ
        </p>
        <ol className="tester-steps">
          <li>
            <code>git clone https://github.com/mongkontep/delivery-status && cd delivery-status && npm install</code>
          </li>
          <li>
            <code>cp .env.example .env.local</code> แล้วใส่ key ของ provider ที่จะลอง
          </li>
          <li>
            <code>npm run playground</code> หน้านี้จะเปิดขึ้นในเครื่อง แล้วแท็บนี้จะใช้ได้
          </li>
        </ol>
        <button type="button" className="try" onClick={check}>
          ลองหาอีกครั้ง
        </button>
      </div>
    );
  }

  const marketplaces = info.enabled.filter((p) => ["shopee", "lazada", "tiktokShop"].includes(p.name));
  return (
    <div className="tester-body">
      <dl className="formats compact">
        <div>
          <dt>provider ที่เปิดอยู่</dt>
          <dd>{info.enabled.length ? info.enabled.map((p) => p.title).join(" → ") : "ยังไม่มี (ใส่ key ใน .env.local)"}</dd>
        </div>
        {info.incomplete.map((p) => (
          <div key={p.name}>
            <dt>{p.title}</dt>
            <dd className="hint bad">ใส่ไม่ครบ ขาด {p.missing.join(", ")}</dd>
          </div>
        ))}
        {marketplaces.map((p) => (
          <div key={p.name}>
            <dt>{p.title}</dt>
            <dd className={info.marketplaceTokens[p.name] ? "hint ok" : "hint bad"}>
              {info.marketplaceTokens[p.name] ? "มี access token แล้ว" : `ใส่ access token ใน .env.local (${p.name === "tiktokShop" ? "TIKTOK_SHOP" : p.name.toUpperCase()}_ACCESS_TOKEN)`}
            </dd>
          </div>
        ))}
      </dl>
      {marketplaces.length > 0 && (
        <label className="field fill">
          เลขพัสดุ → เลขคำสั่งซื้อ (สำหรับ marketplace บรรทัดละคู่)
          <textarea className="text-input payload-input" rows={2} placeholder="TH012345678912A 241002ABCDEF" value={orders} onChange={(e) => setOrders(e.target.value)} />
        </label>
      )}
      <DeliveryStatus className="fill" track={track} />
      <Raw result={result} />
    </div>
  );
};

export const Tester = () => {
  const [tab, setTab] = useState("post");
  return (
    <section className="example" id="tester">
      <div className="example-head">
        <h2>ลองกับ API จริง</h2>
        <p>ใส่ key แล้วกรอกเลขพัสดุจริง กดตรวจสอบเพื่อดูว่าสถานะขึ้นไหม ด้านล่างแสดงคำตอบจาก API ของแต่ละเลข เอาไว้ดูว่า key ใช้ได้หรือติดตรงไหน</p>
      </div>
      <div className="segmented tester-tabs" role="group" aria-label="วิธีทดสอบ">
        <button type="button" aria-pressed={tab === "post"} onClick={() => setTab("post")}>
          ไปรษณีย์ไทย (ในเบราว์เซอร์)
        </button>
        <button type="button" aria-pressed={tab === "local"} onClick={() => setTab("local")}>
          ทุก provider (server ในเครื่อง)
        </button>
      </div>
      {tab === "post" ? <ThailandPostTester /> : <LocalTester />}
    </section>
  );
};
