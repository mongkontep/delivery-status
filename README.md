# @inverz/delivery-status

ช่องกรอก **เลขพัสดุ** สำหรับ React ใส่ได้หลายเลขพร้อมกัน และหลายขนส่งปนกันในครั้งเดียว เดาขนส่งจากรูปแบบเลขให้ (เลือกเองได้) แล้วแสดงสถานะเป็นภาษาไทย พร้อมแถบความคืบหน้าและไทม์ไลน์ ฝั่ง server ตั้งค่าใน `.env` อย่างเดียว รองรับ API ไปรษณีย์ไทย (ฟรี), API ของ Flash / J&T / Ninja Van / DHL eCommerce, Shopee / Lazada / TikTok Shop และ aggregator 6 เจ้า (รวม eTrackings ของไทย) ผลลัพธ์ทุกขนส่งเป็นรูปแบบเดียวกัน ไม่มี dependency

**[ดูตัวอย่าง (Demo)](https://inverz-npm-package.web.app/deliverystatus/)**

Parcel tracking for React: paste one or many tracking numbers, detect the carrier (Thailand Post, Kerry, Flash, J&T, Shopee, Lazada, Ninja Van and more) and show a delivery timeline with Thai status text, plus a server helper for the carrier APIs.

## ติดตั้ง

```bash
npm i @inverz/delivery-status
```

```jsx
import "@inverz/delivery-status/style.css";
import { DeliveryStatus } from "@inverz/delivery-status";

<DeliveryStatus endpoint="/api/track" />
```

หน้าเว็บไม่ถือ API key ทุกอย่างผ่าน endpoint ของคุณ (ดู [ฝั่ง server](#ฝั่ง-server))

## ทำงานอย่างไร

1. ผู้ใช้วางเลขพัสดุ คั่นด้วยเว้นวรรค จุลภาค หรือขึ้นบรรทัดใหม่ แต่ละเลขกลายเป็นป้ายพร้อมขนส่งที่เดาได้ ถ้าเดาผิดเลือกขนส่งใหม่ได้ที่ป้าย
2. กด "ตรวจสอบสถานะ" component ส่ง `POST { items: [{ number, carrier }] }` ไปที่ `endpoint` (`carrier` มีค่าเฉพาะเลขที่ผู้ใช้เลือกขนส่งเอง)
3. server ถาม provider ที่เปิดไว้ใน `.env` ตามลำดับ (API ของขนส่ง → marketplace → ไปรษณีย์ไทย → aggregator) จนเจอข้อมูล เลขที่รูปแบบตรงกับหลายขนส่งจะถามทุกเจ้าพร้อมกัน แล้วใช้เจ้าที่มีข้อมูล ตอบ `{ shipments: [...] }` และป้ายในช่องกรอกเปลี่ยนเป็นขนส่งที่เจอจริง ขนส่งที่ไม่ได้ตั้งค่า provider ไว้ แสดงปุ่มเปิดดูที่เว็บขนส่งแทน
4. แต่ละพัสดุแสดงสถานะ ขั้นตอน (รับพัสดุ → ระหว่างขนส่ง → กำลังนำจ่าย → ส่งสำเร็จ) ไทม์ไลน์ และลิงก์ไปหน้าติดตามของขนส่ง

## ขนส่งที่รองรับ

| id | ขนส่ง | ดึงสถานะได้จาก | เดาจากเลข |
|---|---|---|---|
| `thailand-post` | ไปรษณีย์ไทย (รวม EMS และพัสดุจากต่างประเทศ) | API ไปรษณีย์ไทย (ฟรี), aggregator | ✓ ตรวจ check digit S10 |
| `kerry` | KEX (Kerry Express) | eTrackings, aggregator อื่น, provider ของคุณ | ✓ `KEX…` |
| `flash` | Flash Express | **API ของ Flash**, aggregator | ✓ `TH` + ตัวอักษรปนตัวเลข |
| `jt` | J&T Express | **API ของ J&T**, aggregator | ✓ ตัวเลข 12 หลัก |
| `spx` | SPX Express (Shopee) | **Shopee Open Platform**, aggregator | ✓ `TH` + ตัวเลข 12 หลัก + ตัวอักษร |
| `lex` | LEX (Lazada) | **Lazada Open Platform**, aggregator | ✓ `LEX…` / `LX…` |
| `ninjavan` | Ninja Van | **API ของ Ninja Van**, aggregator | ✓ `NVTH…` |
| `best` | BEST Express | eTrackings, aggregator อื่น, provider ของคุณ | เลือกเอง |
| `scg` | SCG Express | aggregator (TrackingMore), provider ของคุณ | ✓ ตัวเลข 7–11 หลัก |
| `dhl-ecommerce` | DHL eCommerce | **API ของ DHL eCommerce**, aggregator | เลือกเอง |
| `nim` | นิ่มเอ็กซ์เพรส | eTrackings, provider ของคุณ | เลือกเอง |
| `dhl` | DHL Express | aggregator | ✓ ตัวเลข 10 หลัก |
| `fedex` | FedEx | aggregator | ✓ |
| `ups` | UPS | aggregator | ✓ `1Z…` |

ทุกขนส่งที่มี marketplace (Shopee, Lazada, TikTok Shop) ดึงผ่าน marketplace ได้ด้วย ถ้าเป็นออเดอร์ของร้านบนแพลตฟอร์มนั้น

ไปรษณีย์ไทยตรวจ check digit ตามมาตรฐาน S10 ของ UPU จึงแม่นยำ ส่วนขนส่งเอกชนไม่ได้ประกาศรูปแบบเลข การเดาจึงอิงรูปแบบที่พบบ่อย และหลายเจ้าใช้รูปแบบซ้ำกัน (เลข 12 หลักอาจเป็น J&T หรือ FedEx) `detectCarrier` จึงคืนรายชื่อเรียงจากน่าจะใช่ที่สุด

เลขที่ตรงหลายขนส่ง server ไม่เดา แต่ **ถามทุกเจ้าพร้อมกัน** (สูงสุด `maxCandidates` = 3 เจ้า) แล้วใช้เจ้าที่มีข้อมูลพัสดุ ถ้ามีข้อมูลมากกว่าหนึ่งเจ้า ใช้เจ้าที่รูปแบบเลขน่าจะใช่กว่า ถ้าไม่มีเจ้าไหนมีข้อมูล ตอบ `not_found` ผู้ใช้เลือกขนส่งเองได้เสมอ และเมื่อเลือกแล้วจะถามเจ้านั้นเจ้าเดียว

## Props

| prop | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `endpoint` | | URL ของ server รับ `POST { items }` ตอบ `{ shipments }` |
| `track` | | ใช้แทน `endpoint`: ฟังก์ชัน `(items) => Promise<Shipment[]>` |
| `headers` | | header เพิ่มตอนเรียก `endpoint` เช่น token ของผู้ใช้ |
| `defaultValue` | | เลขเริ่มต้น เป็นข้อความ (คั่นอะไรก็ได้) หรือ array |
| `autoTrack` | `false` | ตรวจ `defaultValue` ทันทีที่แสดง |
| `max` | `20` | จำนวนเลขสูงสุดต่อครั้ง |
| `carriers` | ทั้งหมด | จำกัดขนส่งที่ใช้เดา ให้เลือก และที่ server ลองถาม เช่น `["thailand-post", "kerry"]` |
| `locale` | `"th"` | `"en"` ข้อความภาษาอังกฤษ |
| `eventsShown` | `4` | จำนวนเหตุการณ์ก่อนกด "ดูทั้งหมด" |
| `onResult` | | `(shipments) => void` |

## ทำหน้าตาเอง

```jsx
import { useTracking, ShipmentCard } from "@inverz/delivery-status";

const OrderTracking = ({ number, carrier }) => {
  const { shipments, loading, error, run } = useTracking({ endpoint: "/api/track" });
  useEffect(() => { run([{ number, carrier }]); }, [number]);
  if (loading) return <p>กำลังโหลด…</p>;
  return shipments.map((s) => <ShipmentCard key={s.number} shipment={s} />);
};
```

มี `CarrierBadge`, `StatusBadge` และ `formatTime` (แสดงเวลาไทย ปี พ.ศ.) ให้ใช้ด้วย

## ฝั่ง server

ตั้งค่าใน `.env` อย่างเดียว ใส่ key ของ provider ไหนครบ provider นั้นเปิดเอง ไม่ใส่อะไรเลยก็ใช้ได้ ทุกเลขยังได้ชื่อขนส่งและปุ่มเปิดหน้าติดตามของขนส่ง

**Next.js (app router)**

```js
// app/api/track/route.js
import { createTrackerFromEnv } from "@inverz/delivery-status/server";

const tracker = createTrackerFromEnv(); // อ่าน process.env
export const POST = (request) => tracker.handleRequest(request);
```

**Express / Firebase Functions**

```js
const { createTrackerFromEnv } = require("@inverz/delivery-status/server");
const tracker = createTrackerFromEnv();

app.post("/api/track", express.json(), tracker.expressHandler);
```

**Cloudflare Workers / runtime ที่ไม่มี `process.env`** ส่ง env เข้าไปเอง: `createTrackerFromEnv(env)`

ดูได้ว่าเปิด provider ไหนอยู่ด้วย `tracker.providers` และตรวจ `.env` ด้วย `checkEnv()` ถ้าใส่ไม่ครบ (เช่นมี `FLASH_MCH_ID` แต่ไม่มี `FLASH_API_KEY`) `createTrackerFromEnv` จะ throw พร้อมบอกว่าขาดตัวไหน แทนที่จะปิดเงียบ ๆ

### ตัวแปรใน `.env`

แพ็กเกจมีไฟล์ตัวอย่างครบทุกตัว: `cp node_modules/@inverz/delivery-status/.env.example .env`

ใช้ฝั่ง server เท่านั้น ห้ามขึ้นต้นด้วย `VITE_` / `NEXT_PUBLIC_` ตัวที่มี (ไม่บังคับ) ไม่ต้องใส่ก็ได้

**1. API ของขนส่งเอง** ต้องมีบัญชีร้านค้ากับขนส่ง ไม่เสียค่า API เพิ่ม ดูได้เฉพาะพัสดุที่ร้านส่งเอง

| provider | ตัวแปร | ขอ key จาก |
|---|---|---|
| Flash Express | `FLASH_MCH_ID`, `FLASH_API_KEY`, (ไม่บังคับ) `FLASH_SANDBOX=true` | เจ้าหน้าที่ Flash |
| Ninja Van | `NINJAVAN_CLIENT_ID`, `NINJAVAN_CLIENT_SECRET`, (ไม่บังคับ) `NINJAVAN_COUNTRY`, `NINJAVAN_SANDBOX` | Ninja Dashboard → Settings → IT Settings แล้วอีเมล th-devsupport@ninjavan.co ขอเปิด tracking API |
| J&T Express | `JT_API_ACCOUNT`, `JT_PRIVATE_KEY`, (ไม่บังคับ) `JT_BASE_URL`, `JT_SANDBOX` | สมัคร open platform ของ J&T และติดต่อฝ่ายขาย J&T ประเทศไทย |
| DHL eCommerce | `DHL_ECOMMERCE_CLIENT_ID`, `DHL_ECOMMERCE_PASSWORD`, (ไม่บังคับ) `DHL_ECOMMERCE_SOLDTO_ACCOUNT`, `DHL_ECOMMERCE_PICKUP_ACCOUNT`, `DHL_ECOMMERCE_SANDBOX` | DHL eCommerce Asia |

**2. Marketplace** ค้นด้วยเลขคำสั่งซื้อเท่านั้น และ access token หมดอายุเร็ว จึงต้องส่งฟังก์ชันในโค้ดด้วย (ดูหัวข้อถัดไป)

| provider | ตัวแปร |
|---|---|
| Shopee | `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, (ไม่บังคับ) `SHOPEE_SHOP_ID`, `SHOPEE_SANDBOX` |
| Lazada | `LAZADA_APP_KEY`, `LAZADA_APP_SECRET` |
| TikTok Shop | `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, (ไม่บังคับ) `TIKTOK_SHOP_CIPHER` |

**3. ไปรษณีย์ไทย** ฟรี ใช้ได้กับทุกเลข

| provider | ตัวแปร | ขอ key จาก |
|---|---|---|
| Thailand Post | `THAILAND_POST_TOKEN`, (ไม่บังคับ) `THAILAND_POST_LANGUAGE` | https://track.thailandpost.co.th/developerGuide |

**4. Aggregator** เสียเงิน ใช้ได้ทุกขนส่ง ถูกถามเป็นลำดับสุดท้าย

| provider | ตัวแปร | หมายเหตุ |
|---|---|---|
| eTrackings | `ETRACKINGS_API_KEY`, `ETRACKINGS_KEY_SECRET`, (ไม่บังคับ) `ETRACKINGS_LANGUAGE` | บริการของไทย ฟรี 50 ครั้ง แพ็กเกจเริ่ม 699 บาท/เดือน รองรับ Kerry, Flash, J&T, SPX, BEST, นิ่มเอ็กซ์เพรส, DHL eCommerce (ไม่รองรับไปรษณีย์ไทย, Lazada, FedEx, UPS, DHL Express) |
| TrackingMore | `TRACKINGMORE_API_KEY` | |
| 17TRACK | `TRACK17_API_KEY` | |
| Track123 | `TRACK123_API_SECRET` | |
| AfterShip | `AFTERSHIP_API_KEY` | |
| Ship24 | `SHIP24_API_KEY` | |

ถ้าเปิดหลายเจ้า จะถาม eTrackings ก่อน แล้วค่อยถามเจ้าต่างประเทศเฉพาะเลขที่ eTrackings ไม่มี

### ลำดับที่ถาม

แต่ละเลขถามตามลำดับในตารางด้านบน (API ของขนส่ง → marketplace → ไปรษณีย์ไทย → aggregator) ตัวถัดไปถูกถามเฉพาะเมื่อตัวก่อนหน้าไม่มีข้อมูลพัสดุหรือเรียกไม่สำเร็จ จึงใช้ของฟรีก่อนเสมอ และ aggregator เสีย credit เฉพาะเลขที่ไม่มีที่อื่นตอบได้

เลขที่รูปแบบตรงหลายขนส่ง (เช่นเลข 12 หลักอาจเป็น J&T หรือ FedEx) ถามทุกขนส่งพร้อมกัน สูงสุด `maxCandidates` (3) เจ้า แล้วใช้เจ้าที่มีข้อมูล ถ้าผู้ใช้เลือกขนส่งเองที่ป้าย จะถามเจ้านั้นเจ้าเดียว ผลที่เจอจำไว้ 5 นาที (`cacheSeconds`)

ตัวเลือกอื่นส่งเป็นอาร์กิวเมนต์ที่สอง: `createTrackerFromEnv(process.env, { max: 20, maxCandidates: 3, cacheSeconds: 300 })`

### Marketplace: Shopee, Lazada, TikTok Shop

ทั้งสามเจ้าค้นด้วยเลขพัสดุไม่ได้ ต้องใช้เลขคำสั่งซื้อ และ token หมดอายุเป็นชั่วโมง (Shopee 4 ชั่วโมง, refresh token ใช้ได้ครั้งเดียว) ใส่ key ใน `.env` แล้วส่งฟังก์ชันสองตัวใน `hooks`:

```js
import { createTrackerFromEnv, shopeeRefreshToken } from "@inverz/delivery-status/server";

const tracker = createTrackerFromEnv(process.env, {
  hooks: {
    shopee: {
      // เลขพัสดุ → คำสั่งซื้อ จากตาราง orders ของคุณ; null = ไม่ใช่ออเดอร์ Shopee ไปถาม provider ถัดไป
      findOrder: async (number) => {
        const order = await db.orders.findOne({ trackingNumber: number, channel: "shopee" });
        return order ? { orderId: order.orderSn, shopId: order.shopId } : null;
      },
      // token ที่ยังไม่หมดอายุ เก็บและต่ออายุเอง (shopeeRefreshToken ช่วยเรียก API ต่ออายุ)
      getAccessToken: async ({ shopId }) => {
        const t = await db.tokens.get("shopee", shopId);
        if (t.expiresAt > Date.now() + 60_000) return t.accessToken;
        const fresh = await shopeeRefreshToken({
          partnerId: process.env.SHOPEE_PARTNER_ID,
          partnerKey: process.env.SHOPEE_PARTNER_KEY,
          shopId,
          refreshToken: t.refreshToken,
        });
        await db.tokens.set("shopee", shopId, { ...fresh, expiresAt: Date.now() + fresh.expiresIn * 1000 });
        return fresh.accessToken;
      },
    },
    // lazada: { findOrder, getAccessToken } (มี lazadaRefreshToken), tiktokShop: { findOrder, getAccessToken }
  },
});
```

`findOrder` คืน `{ orderId, packageId?, shopId?, shopCipher? }` ถ้าใส่ key ของ marketplace ใน `.env` แต่ไม่ส่ง hooks จะ throw บอกว่าขาดฟังก์ชันไหน

### ไม่ใช้ `.env`

ประกอบ provider เองได้ทุกตัว: `createTracker({ providers: [flash({ mchId, key }), thailandPost({ token })] })` มี `flash`, `ninjaVan`, `jt`, `dhlEcommerce`, `shopee`, `lazada`, `tiktokShop`, `thailandPost`, `eTrackings`, `trackingMore`, `track17`, `track123`, `afterShip`, `ship24`

### เขียน provider เอง

ขนส่งที่ยังไม่มี API ของตัวเอง (Kerry, SCG, BEST, นิ่มเอ็กซ์เพรส ไม่มีเอกสาร API สาธารณะ ใช้ผ่าน eTrackings ได้) ถ้าคุณได้ API มาจากขนส่งโดยตรง หรือมีระบบภายในของคุณเอง เขียนเป็น object แล้วใส่ใน `providers` จะถูกถามก่อนตัวจาก `.env`

```js
import { createTrackerFromEnv, statusFromText } from "@inverz/delivery-status/server";

const kerryApi = {
  name: "kerry",
  carriers: ["kerry"], // หรือ anyCarrier: true ถ้าตอบได้ทุกขนส่ง
  async track(items) {
    const rows = await myKerryClient.lookup(items.map((i) => i.number));
    return items.map((i) => {
      const r = rows.find((x) => x.con_no === i.number);
      if (!r) return { number: i.number, carrier: "kerry", error: "not_found", events: [] }; // ส่งต่อ provider ถัดไป
      return {
        number: i.number,
        carrier: "kerry",
        events: r.history.map((h) => ({
          time: new Date(h.at).toISOString(),
          status: statusFromText(h.desc) ?? "in_transit",
          text: h.desc,
          location: h.branch,
        })),
      };
    });
  },
};

const tracker = createTrackerFromEnv(process.env, { providers: [kerryApi] });
```

`statusFromText` แปลงข้อความภาษาไทยหรืออังกฤษเป็นสถานะกลาง เช่น "นำจ่ายสำเร็จ" → `delivered`, "ส่งคืนต้นทาง" → `returned`

### สิ่งที่ server ทำให้

- ต่ออายุ token ของแต่ละ provider เอง (ไปรษณีย์ไทย, Ninja Van, DHL eCommerce) และขอใหม่อัตโนมัติถ้าโดนปฏิเสธ
- เซ็น request ตามที่แต่ละเจ้ากำหนด (Flash SHA-256, J&T MD5, Shopee / Lazada / TikTok HMAC-SHA256) ด้วย Web Crypto จึงรันบน edge ได้
- แปลงเวลาเป็น ISO 8601 (ไปรษณีย์ไทยส่งปี พ.ศ., J&T / DHL ส่งเวลาไทยไม่มี timezone)
- รวมเลขเป็นชุดตามที่แต่ละเจ้ารับได้ (ไปรษณีย์ไทย 100, J&T 30, DHL 100, 17TRACK 40)
- ไม่ throw ทั้งชุดเพราะเลขเดียวมีปัญหา แต่ละพัสดุบอกใน `error`: `not_found`, `unsupported`, `invalid`, `provider_error`
- จำกัดจำนวนเลขต่อ request (`max` 20) ควรใส่ rate limit ที่ endpoint ด้วยถ้าเปิดให้คนทั่วไปใช้

API ไปรษณีย์ไทยเปิด CORS ก็จริง แต่ห้ามเรียกจากหน้าเว็บ เพราะต้องส่ง token ไปด้วย

## ข้อมูลที่ได้

```js
{
  number: "EF582568151TH",
  carrier: "thailand-post",
  status: "delivered",
  statusText: "นำจ่ายสำเร็จ · ผู้รับได้รับเรียบร้อย",
  updatedAt: "2026-09-26T06:30:00.000Z",
  delivered: true,
  receiver: "สมชาย",
  events: [{ time, status, text, location, code }],   // ใหม่ไปเก่า
  url: "https://track.thailandpost.co.th/?trackNumber=EF582568151TH",
  error: undefined
}
```

| `status` | ภาษาไทย |
|---|---|
| `pending` | รอข้อมูลจากขนส่ง |
| `info_received` | ผู้ส่งแจ้งข้อมูลพัสดุแล้ว |
| `accepted` | รับพัสดุแล้ว |
| `in_transit` | อยู่ระหว่างขนส่ง |
| `out_for_delivery` | กำลังนำจ่าย |
| `delivered` | นำจ่ายสำเร็จ |
| `failed_attempt` | นำจ่ายไม่สำเร็จ |
| `returned` | ส่งคืนผู้ส่ง |
| `exception` | พัสดุมีปัญหา |
| `not_found` | ไม่พบข้อมูลพัสดุ |

## ใช้โดยไม่มี React

`@inverz/delivery-status/core` ไม่ดึง React และไม่เรียก network

```js
import { parseNumbers, detectCarrier, trackingUrl, isS10 } from "@inverz/delivery-status/core";

parseNumbers("ef582568151th, KEX20898721369\nEF582568151TH"); // ["EF582568151TH", "KEX20898721369"]
detectCarrier("820112345678").map((c) => c.id);              // ["jt", "fedex"]
trackingUrl("kerry", "KEX20898721369");                       // "https://th.kex-express.com/th/track/?track=KEX20898721369"
isS10("EF582568151TH");                                       // true
```

| ฟังก์ชัน | คำอธิบาย |
|---|---|
| `CARRIERS` | รายชื่อขนส่ง: `id`, `th`, `en`, สี, ลิงก์หน้าติดตาม, รหัสขนส่งของแต่ละ aggregator |
| `parseNumbers(text)` | แยกเลขจากข้อความ ตัดช่องว่าง/ขีด แปลงเลขไทย ตัดเลขซ้ำ |
| `cleanNumber(text)` | ทำความสะอาดเลขเดียว |
| `detectCarrier(number, { carriers })` | ขนส่งที่รูปแบบตรง เรียงจากน่าจะใช่ที่สุด |
| `trackingUrl(carrier, number)` | ลิงก์หน้าติดตามของขนส่ง หรือ `null` |
| `isS10(number)` | เลขไปรษณีย์มาตรฐาน UPU ที่ check digit ถูก |
| `statusLabel(status, locale)`, `STATUSES`, `STEPS` | ข้อความสถานะ |
| `statusFromText(text)` | เดาสถานะจากข้อความ |

## ธีม

ปรับด้วย CSS variables `--tds-brand`, `--tds-surface`, `--tds-surface-muted`, `--tds-border`, `--tds-border-strong`, `--tds-text`, `--tds-text-muted`, `--tds-success`, `--tds-warning`, `--tds-danger`, `--tds-font` หรือใช้ `--tdp-*` ชุดเดียวกับแพ็กเกจอื่นของ Inverz

## ข้อควรรู้

- **ทดสอบกับระบบจริงก่อนใช้:** provider ทุกตัวเขียนตามเอกสารทางการและผ่านเทสต์ที่จำลองคำตอบตามเอกสาร แต่ยังไม่ได้ลองกับ API จริงของแต่ละเจ้า แนะนำให้ลองกับ sandbox (`*_SANDBOX=true`) ก่อน
- **จุดที่เอกสารไม่ชัด:** host production ของ J&T ประเทศไทย (ตั้ง `JT_BASE_URL` ได้ถ้า J&T ให้ที่อื่น), `messageVersion` และรูปแบบคำตอบตอนขอ token ของ DHL eCommerce, รายการรหัสสถานะทั้งหมดของ Shopee / Lazada (แพ็กเกจแปลงจากชื่อสถานะและข้อความแทน)
- **Ninja Van** ต้องอีเมลขอเปิด tracking API ก่อน แม้ใน sandbox
- **API ของขนส่งและ marketplace ดูได้เฉพาะพัสดุของร้านตัวเอง** เลขจากร้านอื่นจะไม่เจอ แล้วถูกส่งต่อไป provider ถัดไป (ไปรษณีย์ไทย หรือ aggregator ถ้าเปิดไว้)
- **ค่าใช้จ่าย:** ไปรษณีย์ไทยฟรีแต่จำกัดจำนวนครั้งต่อวัน aggregator คิดเงินตามจำนวนเลข และเลขที่ถามหลายขนส่งเสียตามจำนวนขนส่งที่ถาม (เลข 12 หลักถามทั้ง J&T และ FedEx = 2 ครั้ง) ลดได้ด้วย `maxCandidates` หรือ prop `carriers` ที่จำกัดขนส่งของร้าน
- **รูปแบบเลขของขนส่งเอกชน และรหัสขนส่งของ aggregator บางเจ้า** มาจากข้อมูลสาธารณะ ไม่ได้รับรองจากขนส่ง
- ชื่อขนส่งเป็นเครื่องหมายการค้าของเจ้าของ แพ็กเกจนี้ไม่ได้เป็นของขนส่งรายใด และไม่ใช้โลโก้ของขนส่ง (ป้ายเป็นอักษรย่อบนสี)

## License

MIT © 2026 Inverz Solutions Co.,Ltd.
