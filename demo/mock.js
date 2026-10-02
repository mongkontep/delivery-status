// Made-up tracking answers for the demo page (the demo has no server and no API keys).
// The same number always gives the same story, so the page looks stable between visits.
import { detectCarrier, trackingUrl } from "../src/core.js";

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const PLACES = ["หลักสี่ กรุงเทพมหานคร", "ศูนย์คัดแยกบางนา", "ศูนย์กระจายสินค้า วังน้อย", "ศูนย์คัดแยกนครสวรรค์", "สาขาเมืองเชียงใหม่"];

const STORIES = [
  // [status, Thai text, place index] from first to last
  [
    ["info_received", "ผู้ส่งแจ้งข้อมูลพัสดุแล้ว", null],
    ["accepted", "รับพัสดุเข้าระบบ", 0],
    ["in_transit", "พัสดุออกจากศูนย์คัดแยก", 1],
    ["in_transit", "พัสดุถึงศูนย์กระจายสินค้า", 2],
    ["in_transit", "พัสดุถึงศูนย์คัดแยกปลายทาง", 3],
    ["out_for_delivery", "อยู่ระหว่างการนำจ่าย", 4],
    ["delivered", "นำจ่ายสำเร็จ ผู้รับได้รับเรียบร้อย", 4],
  ],
  [
    ["accepted", "รับฝาก", 0],
    ["in_transit", "อยู่ระหว่างการขนส่ง", 1],
    ["in_transit", "รับเข้า ณ ศูนย์คัดแยก", 2],
  ],
  [
    ["accepted", "รับพัสดุเข้าระบบ", 0],
    ["in_transit", "พัสดุถึงศูนย์คัดแยกปลายทาง", 3],
    ["out_for_delivery", "อยู่ระหว่างการนำจ่าย", 4],
  ],
  [
    ["accepted", "รับฝาก", 0],
    ["in_transit", "อยู่ระหว่างการขนส่ง", 2],
    ["out_for_delivery", "อยู่ระหว่างการนำจ่าย", 4],
    ["failed_attempt", "นำจ่ายไม่สำเร็จ ติดต่อผู้รับไม่ได้ จะนำจ่ายใหม่วันถัดไป", 4],
  ],
];

const RECEIVERS = ["สมชาย ใจดี", "สุดา รักไทย", "ณัฐพล มั่นคง"];

/** Same signature as a real `track`: [{ number, carrier }] → Shipment[] */
export const mockTrack = async (items) => {
  await new Promise((r) => setTimeout(r, 650));
  const now = Date.now();
  return items.map(({ number, carrier, carriers }) => {
    const h = hash(number);
    // like the server: with no carrier picked, the parcel turns up at one of the carriers its format fits
    const fits = detectCarrier(number, { carriers });
    const c = carrier ?? fits[h % Math.max(1, fits.length)]?.id ?? null;
    if (h % 9 === 0) return { number, carrier: c, status: "not_found", error: "not_found", events: [], delivered: false, url: trackingUrl(c, number) };
    const story = STORIES[h % STORIES.length];
    // spread the steps over the last few days, ending a few hours ago
    const end = now - ((h % 5) + 1) * 3600e3;
    const events = story
      .map(([status, text, place], i) => ({
        time: new Date(end - (story.length - 1 - i) * (9 + (h % 7)) * 3600e3).toISOString(),
        status,
        text,
        location: place === null ? "" : PLACES[place],
      }))
      .reverse();
    const status = events[0].status;
    return {
      number,
      carrier: c,
      status,
      statusText: events[0].text,
      updatedAt: events[0].time,
      delivered: status === "delivered",
      receiver: status === "delivered" ? RECEIVERS[h % RECEIVERS.length] : null,
      events,
      url: trackingUrl(c, number),
    };
  });
};
