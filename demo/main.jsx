import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/style.css";
import "./demo.css";
import { DeliveryStatus, ShipmentCard, CarrierBadge, CARRIERS, detectCarrier, parseNumbers } from "../src/index.js";
import { mockTrack } from "./mock.js";
import { Tester } from "./tester.jsx";

const NPM = "https://www.npmjs.com/package/@inverz/delivery-status";
const HOME = "https://inverz-npm-package.web.app/";
const INSTALL = "npm i @inverz/delivery-status";

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "คัดลอกแล้ว" : "คัดลอก"}
    </button>
  );
};

// the JavaScript / TypeScript choice is shared by every code block on the page and remembered
const LANG_KEY = "inverz-demo-code-lang";
let codeLang = (() => {
  try {
    return localStorage.getItem(LANG_KEY) === "ts" ? "ts" : "js";
  } catch {
    return "js";
  }
})();
const langListeners = new Set();
const useCodeLang = () => {
  const [lang, setLang] = useState(codeLang);
  useEffect(() => {
    langListeners.add(setLang);
    return () => langListeners.delete(setLang);
  }, []);
  const choose = (next) => {
    codeLang = next;
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {}
    langListeners.forEach((fn) => fn(next));
  };
  return [lang, choose];
};


// each example is written twice; `both(js, ts)` registers the TypeScript version of a JS block
const TS = new Map();
const both = (js, ts) => {
  TS.set(js, ts);
  return js;
};


const autoTs = (code) => code;
const toTs = (code) => TS.get(code) ?? autoTs(code);

const Code = ({ children }) => {
  const [lang, setLang] = useCodeLang();
  const ts = toTs(children);
  // every JS/JSX block gets both tabs; TS is the same code when no types are needed. CSS stays as is.
  // CSS and .env blocks are not code in either language, so they get no tabs
  const hasTs = !/^\s*(:root|\.[\w-]+\s*\{|@media|#|[A-Z_]+=)/.test(children);
  const shown = hasTs && lang === "ts" ? ts : children;
  return (
    <div className={hasTs ? "code code--tabs" : "code"}>
      {hasTs && (
        <div className="code-tabs" role="group" aria-label="ภาษา">
          {[
            ["js", "JavaScript"],
            ["ts", "TypeScript"],
          ].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={lang === key} onClick={() => setLang(key)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <pre>
        <code>{shown}</code>
      </pre>
      <CopyButton text={shown} />
    </div>
  );
};

const MANAGERS = [
  ["npm", "npm i"],
  ["yarn", "yarn add"],
  ["pnpm", "pnpm add"],
  ["bun", "bun add"],
];

const InstallBox = ({ packages }) => {
  const [pm, setPm] = useState(() => {
    try {
      return localStorage.getItem("inverz-demo-pm") || "npm";
    } catch {
      return "npm";
    }
  });
  const command = `${MANAGERS.find(([k]) => k === pm)[1]} ${packages}`;
  return (
    <div className="install-wrap">
      <div className="pm-tabs" role="group" aria-label="ตัวจัดการแพ็กเกจ">
        {MANAGERS.map(([key]) => (
          <button
            key={key}
            type="button"
            aria-pressed={pm === key}
            onClick={() => {
              setPm(key);
              try {
                localStorage.setItem("inverz-demo-pm", key);
              } catch {}
            }}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="install">
        <code>{command}</code>
        <CopyButton text={command} />
      </div>
    </div>
  );
};


const Example = ({ id, title, description, code, children }) => (
  <section className="example" id={id}>
    <div className="example-head">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    <div className="example-body">
      {children && <div className="preview">{children}</div>}
      <Code>{code}</Code>
    </div>
  </section>
);


const SAMPLES = ["EF582568151TH", "KEX20898721369", "TH0915EKX18T2D", "820112345678", "880011223344", "TH012345678912A", "NVTH12345678", "1Z999AA10123456784"];

const BasicExample = () => (
  <Example
    id="basic"
    title="กรอกหลายเลขพร้อมกัน"
    description="วางเลขพัสดุทีละหลายเลข คั่นด้วยเว้นวรรค จุลภาค หรือขึ้นบรรทัดใหม่ ส่งไปที่ endpoint ของคุณครั้งเดียวทุกเลข เลขที่รูปแบบตรงกับหลายขนส่ง server ถามทุกเจ้าพร้อมกัน แล้วใช้เจ้าที่มีข้อมูลพัสดุ ป้ายจะเปลี่ยนเป็นขนส่งนั้นเอง (ลอง 880011223344 ป้ายขึ้น J&T แต่เจอที่ FedEx) หรือเลือกขนส่งเองที่ป้ายก็ได้"
    code={both(
      `<DeliveryStatus endpoint="/api/track" />`,
      `import type { Shipment } from "@inverz/delivery-status";

<DeliveryStatus
  endpoint="/api/track"
  onResult={(shipments: Shipment[]) => console.log(shipments)}
/>`,
    )}
  >
    <DeliveryStatus className="fill" track={mockTrack} defaultValue={SAMPLES.slice(0, 3)} />
    <div className="chips">
      {SAMPLES.map((n) => (
        <button key={n} type="button" onClick={() => navigator.clipboard?.writeText(n)} title="คัดลอก">
          {n}
        </button>
      ))}
    </div>
    <p className="note hint-note">กดเลขตัวอย่างเพื่อคัดลอก แล้ววางในช่องด้านบน</p>
  </Example>
);

const DetectExample = () => {
  const [text, setText] = useState("EF582568151TH 820112345678 NVTH12345678");
  const numbers = parseNumbers(text);
  return (
    <Example
      id="detect"
      title="เดาขนส่งจากเลขพัสดุ"
      description="detectCarrier คืนรายชื่อขนส่งที่รูปแบบเลขตรง เรียงจากน่าจะใช่ที่สุด ไปรษณีย์ไทยตรวจ check digit ตามมาตรฐาน S10 จึงแม่นยำ ส่วนขนส่งเอกชนเป็นการเดาจากรูปแบบที่พบบ่อย เช่นเลข 12 หลักอาจเป็น J&T หรือ FedEx กรณีนี้ server ถามทั้งคู่แล้วใช้เจ้าที่มีข้อมูล"
      code={both(
        `import { detectCarrier, parseNumbers } from "@inverz/delivery-status/core";

parseNumbers("ef582568151th, 820112345678");
// ["EF582568151TH", "820112345678"]

detectCarrier("EF582568151TH").map((c) => c.id); // ["thailand-post"]
detectCarrier("820112345678").map((c) => c.id);  // ["jt", "fedex"]`,
        `import { detectCarrier, parseNumbers } from "@inverz/delivery-status/core";
import type { Carrier } from "@inverz/delivery-status/core";

const numbers: string[] = parseNumbers("ef582568151th, 820112345678");
// ["EF582568151TH", "820112345678"]

const tp: Carrier[] = detectCarrier("EF582568151TH"); // [thailand-post]
const jt: Carrier[] = detectCarrier("820112345678");  // [jt, fedex]`,
      )}
    >
      <textarea className="text-input payload-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="เลขพัสดุ" />
      <dl className="formats compact">
        {numbers.length ? (
          numbers.map((n) => {
            const found = detectCarrier(n);
            return (
              <div key={n}>
                <dt>{n}</dt>
                <dd className="detect-row">
                  {found.length ? found.map((c) => <CarrierBadge key={c.id} carrier={c.id} />) : <span className="note">ไม่ทราบ (เลือกเองได้)</span>}
                </dd>
              </div>
            );
          })
        ) : (
          <div>
            <dt>—</dt>
            <dd>พิมพ์เลขพัสดุ</dd>
          </div>
        )}
      </dl>
    </Example>
  );
};

const OWN_API = {
  "thailand-post": "API ไปรษณีย์ไทย (ฟรี)",
  kerry: "eTrackings, aggregator",
  best: "eTrackings, aggregator",
  nim: "eTrackings",
  flash: "API ของ Flash, aggregator",
  jt: "API ของ J&T, aggregator",
  ninjavan: "API ของ Ninja Van, aggregator",
  "dhl-ecommerce": "API ของ DHL eCommerce, aggregator",
  spx: "Shopee Open Platform, aggregator",
  lex: "Lazada Open Platform, aggregator",
};

const CarriersTable = () => (
  <section className="example" id="carriers">
    <div className="example-head">
      <h2>ขนส่งที่รองรับ</h2>
      <p>
        ไปรษณีย์ไทยใช้ API ของไปรษณีย์ไทยเอง (ขอ token ฟรี) Flash, J&T, Ninja Van และ DHL eCommerce ใช้ API ร้านค้าของขนส่ง (ต้องมีบัญชีร้านค้า)
        Shopee / Lazada / TikTok Shop ใช้ API ของ marketplace ขนส่งที่เหลือผ่าน aggregator (เสียเงิน) หรือ provider ที่เขียนเอง
        ขนส่งที่ไม่ได้ตั้งค่า มีปุ่มเปิดหน้าติดตามของขนส่งให้ลูกค้ากดดูเอง
      </p>
    </div>
    <div className="table-wrap">
      <table className="carriers">
        <thead>
          <tr>
            <th>ขนส่ง</th>
            <th>id</th>
            <th>ดึงสถานะผ่าน</th>
            <th>เดาจากเลข</th>
          </tr>
        </thead>
        <tbody>
          {CARRIERS.map((c) => (
            <tr key={c.id}>
              <td>
                <CarrierBadge carrier={c.id} />
              </td>
              <td>
                <code>{c.id}</code>
              </td>
              <td>{OWN_API[c.id] ?? (c.trackingMore || c.track17 || c.track123 || c.afterShip ? "aggregator" : "provider ของคุณ")}</td>
              <td>{c.patterns.length ? "✓" : "เลือกเอง"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

const CardExample = () => {
  const [shipment, setShipment] = useState(null);
  useEffect(() => {
    mockTrack([{ number: "TH012345678912A", carrier: "spx" }]).then(([s]) => setShipment(s));
  }, []);
  return (
    <Example
      id="card"
      title="ทำหน้าตาเอง: useTracking และ ShipmentCard"
      description="ใช้ hook useTracking เรียก endpoint แล้ววาดเอง หรือใช้ ShipmentCard แสดงผลพัสดุทีละชิ้น เช่นในหน้ารายละเอียดคำสั่งซื้อที่รู้เลขพัสดุอยู่แล้ว"
      code={both(
        `import { useTracking, ShipmentCard } from "@inverz/delivery-status";

const OrderTracking = ({ number, carrier }) => {
  const { shipments, loading, run } = useTracking({ endpoint: "/api/track" });
  useEffect(() => { run([{ number, carrier }]); }, [number]);
  if (loading) return <p>กำลังโหลด…</p>;
  return shipments.map((s) => <ShipmentCard key={s.number} shipment={s} />);
};`,
        `import { useEffect } from "react";
import { useTracking, ShipmentCard } from "@inverz/delivery-status";
import type { CarrierId } from "@inverz/delivery-status";

type Props = { number: string; carrier?: CarrierId };

const OrderTracking = ({ number, carrier }: Props) => {
  const { shipments, loading, run } = useTracking({ endpoint: "/api/track" });
  useEffect(() => { run([{ number, carrier }]); }, [number]);
  if (loading) return <p>กำลังโหลด…</p>;
  return <>{shipments.map((s) => <ShipmentCard key={s.number} shipment={s} />)}</>;
};`,
      )}
    >
      <div className="tds fill">{shipment ? <ShipmentCard shipment={shipment} /> : <p className="note">กำลังโหลด…</p>}</div>
    </Example>
  );
};

const EnglishExample = () => (
  <Example
    id="english"
    title="ภาษาอังกฤษ และจำกัดขนส่ง"
    description="locale=&quot;en&quot; เปลี่ยนข้อความทั้งหมด carriers จำกัดรายชื่อขนส่งที่เลือกได้และใช้เดา autoTrack ตรวจเลขใน defaultValue ทันทีที่เปิดหน้า"
    code={both(
      `<DeliveryStatus
  endpoint="/api/track"
  locale="en"
  carriers={["thailand-post", "kerry", "flash"]}
  defaultValue="KEX20898721369"
  autoTrack
/>`,
      `import type { CarrierId } from "@inverz/delivery-status";

const carriers: CarrierId[] = ["thailand-post", "kerry", "flash"];

<DeliveryStatus
  endpoint="/api/track"
  locale="en"
  carriers={carriers}
  defaultValue="KEX20898721369"
  autoTrack
/>`,
    )}
  >
    <DeliveryStatus className="fill" track={mockTrack} locale="en" carriers={["thailand-post", "kerry", "flash"]} defaultValue="KEX20898721369" autoTrack eventsShown={3} />
  </Example>
);

const SERVER_ENV = `# .env ฝั่ง server เท่านั้น ใส่เฉพาะ provider ที่ใช้ ใส่ครบตัวไหน ตัวนั้นเปิดเอง
# ตัวอย่างครบทุกตัว: cp node_modules/@inverz/delivery-status/.env.example .env

# API ของขนส่งเอง (บัญชีร้านค้า)
FLASH_MCH_ID=...
FLASH_API_KEY=...
NINJAVAN_CLIENT_ID=...
NINJAVAN_CLIENT_SECRET=...
JT_API_ACCOUNT=...
JT_PRIVATE_KEY=...
DHL_ECOMMERCE_CLIENT_ID=...
DHL_ECOMMERCE_PASSWORD=...

# Marketplace (ต้องส่ง hooks findOrder, getAccessToken ในโค้ดด้วย)
SHOPEE_PARTNER_ID=...
SHOPEE_PARTNER_KEY=...
LAZADA_APP_KEY=...
LAZADA_APP_SECRET=...
TIKTOK_SHOP_APP_KEY=...
TIKTOK_SHOP_APP_SECRET=...

# ไปรษณีย์ไทย (ฟรี)
THAILAND_POST_TOKEN=...

# Aggregator (เสียเงิน ถามเป็นลำดับสุดท้าย)
ETRACKINGS_API_KEY=...       # ของไทย: Kerry, Flash, J&T, SPX, BEST, นิ่ม
ETRACKINGS_KEY_SECRET=...
TRACKINGMORE_API_KEY=...
TRACK17_API_KEY=...
TRACK123_API_SECRET=...
AFTERSHIP_API_KEY=...
SHIP24_API_KEY=...`;

const ServerSection = () => (
  <>
    <Example
      id="server"
      title="ฝั่ง server"
      description="ตั้งค่าใน .env อย่างเดียว createTrackerFromEnv เปิด provider ที่ใส่ key ครบ แล้วถามตามลำดับ API ของขนส่ง → marketplace → ไปรษณีย์ไทย → aggregator จนเจอข้อมูล ของฟรีจึงถูกใช้ก่อนเสมอ ไม่ใส่อะไรเลยก็ยังได้ชื่อขนส่งและปุ่มเปิดเว็บขนส่ง ส่วนอื่น: เลขที่รูปแบบตรงหลายขนส่งถามทุกเจ้าพร้อมกัน (สูงสุด 3) แล้วใช้เจ้าที่มีข้อมูล เลขไปรษณีย์ไทยไป API ไปรษณีย์ไทย (รวมทีละไม่เกิน 100 เลขต่อครั้ง ต่ออายุ token ให้เอง) เลขอื่นไป TrackingMore ผลลัพธ์ทุกขนส่งเป็นรูปแบบเดียวกัน จำผลไว้ 5 นาทีเพื่อประหยัดโควตา และไม่ throw ทั้งชุดเพราะเลขเดียวมีปัญหา"
      code={SERVER_ENV}
    />
    <Example
      id="nextjs"
      title="Next.js (app router)"
      code={both(
        `// app/api/track/route.js
import { createTrackerFromEnv } from "@inverz/delivery-status/server";

const tracker = createTrackerFromEnv(); // อ่าน process.env

export const POST = (request) => tracker.handleRequest(request);`,
        `// app/api/track/route.ts
import { createTrackerFromEnv } from "@inverz/delivery-status/server";

const tracker = createTrackerFromEnv(); // อ่าน process.env

export const POST = (request: Request): Promise<Response> => tracker.handleRequest(request);`,
      )}
    />
    <Example
      id="express"
      title="Express / Firebase Functions"
      code={both(
        `const express = require("express");
const { createTrackerFromEnv } = require("@inverz/delivery-status/server");

const tracker = createTrackerFromEnv();

const app = express();
app.post("/api/track", express.json(), tracker.expressHandler);

// หรือเรียกเองจากโค้ดฝั่ง server
const shipments = await tracker.track(["EF582568151TH"]);`,
        `import express from "express";
import { createTrackerFromEnv } from "@inverz/delivery-status/server";
import type { Shipment } from "@inverz/delivery-status/server";

const tracker = createTrackerFromEnv();

const app = express();
app.post("/api/track", express.json(), tracker.expressHandler);

// หรือเรียกเองจากโค้ดฝั่ง server
const shipments: Shipment[] = await tracker.track(["EF582568151TH"]);`,
      )}
    />
    <Example
      id="provider"
      title="ต่อ API ของขนส่งเอง"
      description="มีสัญญากับขนส่งและได้ API ของร้านค้าอยู่แล้ว เขียน provider ใส่ใน providers ได้เลย provider ที่ใส่เองถูกเลือกก่อนตัวในแพ็กเกจ แปลงสถานะของขนส่งด้วย statusFromText ได้ถ้าขนส่งให้มาแค่ข้อความ"
      code={both(
        `import { createTracker, statusFromText } from "@inverz/delivery-status/server";

const kerryApi = {
  carriers: ["kerry"],
  async track(items) {
    const rows = await myKerryClient.lookup(items.map((i) => i.number));
    return rows.map((r) => ({
      number: r.con_no,
      carrier: "kerry",
      events: r.history.map((h) => ({
        time: new Date(h.at).toISOString(),
        status: statusFromText(h.desc) ?? "in_transit",
        text: h.desc,
        location: h.branch,
      })),
    }));
  },
};

const tracker = createTracker({ providers: [kerryApi] });`,
        `import { createTracker, statusFromText } from "@inverz/delivery-status/server";
import type { Provider } from "@inverz/delivery-status/server";

const kerryApi: Provider = {
  carriers: ["kerry"],
  async track(items) {
    const rows = await myKerryClient.lookup(items.map((i) => i.number));
    return rows.map((r) => ({
      number: r.con_no,
      carrier: "kerry",
      events: r.history.map((h) => ({
        time: new Date(h.at).toISOString(),
        status: statusFromText(h.desc) ?? "in_transit",
        text: h.desc,
        location: h.branch,
      })),
    }));
  },
};

const tracker = createTracker({ providers: [kerryApi] });`,
      )}
    />
    <Example
      id="shape"
      title="ข้อมูลที่ได้"
      description="ทุกขนส่งได้รูปแบบเดียวกัน events เรียงใหม่ไปเก่า เวลาเป็น ISO 8601 (ไปรษณีย์ไทยส่งปี พ.ศ. มา แปลงให้แล้ว)"
      code={both(
        `{
  number: "EF582568151TH",
  carrier: "thailand-post",
  status: "delivered",        // pending | info_received | accepted | in_transit
                              // out_for_delivery | delivered | failed_attempt
                              // returned | exception | not_found
  statusText: "นำจ่ายสำเร็จ",
  updatedAt: "2026-09-26T06:30:00.000Z",
  delivered: true,
  receiver: "สมชาย",
  events: [{ time, status, text, location }],
  url: "https://track.thailandpost.co.th/?trackNumber=EF582568151TH",
  error: undefined            // not_found | unsupported | invalid | provider_error
}`,
        `import type { Shipment } from "@inverz/delivery-status";

const shipment: Shipment = {
  number: "EF582568151TH",
  carrier: "thailand-post",
  status: "delivered",
  statusText: "นำจ่ายสำเร็จ",
  updatedAt: "2026-09-26T06:30:00.000Z",
  delivered: true,
  receiver: "สมชาย",
  events: [],
  url: "https://track.thailandpost.co.th/?trackNumber=EF582568151TH",
};`,
      )}
    />
  </>
);

const HeroDemo = () => (
  <div className="hero-demo hero-form ds-hero">
    <DeliveryStatus track={mockTrack} defaultValue="TH012345678912A" autoTrack eventsShown={2} />
  </div>
);

const App = () => (
  <>
    <nav className="topbar" aria-label="เมนู">
      <div className="wrap topbar-inner">
        <a className="topbar-home" href={HOME}>
          <span aria-hidden="true">←</span> หน้าแรก
        </a>
        <span className="topbar-pkg">@inverz/delivery-status</span>
      </div>
    </nav>
    <header className="hero">
      <div className="wrap hero-grid ds-hero-grid">
        <div>
          <p className="eyebrow">React · ไปรษณีย์ไทย / Kerry / Flash / J&T / SPX / Lazada / Ninja Van และอื่น ๆ</p>
          <h1>
            Delivery Status <span className="be">ติดตามพัสดุ</span>
          </h1>
          <p className="lead">
            ช่องกรอกเลขพัสดุ ใส่ได้หลายเลขพร้อมกันและหลายขนส่งปนกัน เดาขนส่งจากรูปแบบเลขให้ แสดงสถานะเป็นภาษาไทยพร้อมไทม์ไลน์ ฝั่ง server ต่อ API ไปรษณีย์ไทยและ
            TrackingMore ให้ ผลลัพธ์ทุกขนส่งเป็นรูปแบบเดียวกัน
          </p>
          <InstallBox packages={INSTALL.replace(/^npm i /, "")} />
          <nav className="links">
            <a href={NPM} target="_blank" rel="noreferrer">npm</a>
            <a href={HOME}>แพ็กเกจอื่น</a>
          </nav>
        </div>
        <HeroDemo />
      </div>
    </header>

    <main className="wrap">
      <p className="callout">
        ตัวอย่างในหน้านี้ใช้<b>ข้อมูลจำลอง</b> ยกเว้นหัวข้อ <a href="#tester">ลองกับ API จริง</a> ที่ใส่ token ของไปรษณีย์ไทยแล้วดูสถานะจริงได้
        ปุ่ม “ดูที่เว็บขนส่ง” เปิดหน้าจริงของขนส่ง
      </p>
      <Example
        id="setup"
        title="เริ่มต้น"
        description="import ธีมแล้วใช้ component ได้เลย ฝั่งหน้าเว็บไม่มี API key ทุกอย่างผ่าน endpoint ของคุณ"
        code={both(
          `import "@inverz/delivery-status/style.css";
import { DeliveryStatus } from "@inverz/delivery-status";`,
          `import "@inverz/delivery-status/style.css";
import { DeliveryStatus } from "@inverz/delivery-status";
import type { Shipment, DeliveryStatusProps } from "@inverz/delivery-status";`,
        )}
      />
      <Tester />
      <BasicExample />
      <DetectExample />
      <CarriersTable />
      <EnglishExample />
      <CardExample />
      <ServerSection />
    </main>

    <footer className="wrap footer">MIT License © 2026 Inverz Solutions Co.,Ltd. · ชื่อขนส่งเป็นเครื่องหมายการค้าของเจ้าของ แพ็กเกจนี้ไม่ได้เป็นของขนส่งรายใด</footer>
  </>
);

createRoot(document.getElementById("root")).render(<App />);
