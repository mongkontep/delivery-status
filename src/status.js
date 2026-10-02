// One status vocabulary for every carrier. Each provider maps its own codes onto these.

/**
 * Normalised statuses, in the order a parcel normally moves through them.
 * `step` places the status on the 4-step progress bar (0 = not started yet, -1 = off the happy path).
 */
export const STATUSES = {
  pending: { step: 0, th: "รอข้อมูลจากขนส่ง", en: "Waiting for carrier", tone: "muted" },
  info_received: { step: 0, th: "ผู้ส่งแจ้งข้อมูลพัสดุแล้ว", en: "Label created", tone: "muted" },
  accepted: { step: 1, th: "รับพัสดุแล้ว", en: "Picked up", tone: "info" },
  in_transit: { step: 2, th: "อยู่ระหว่างขนส่ง", en: "In transit", tone: "info" },
  out_for_delivery: { step: 3, th: "กำลังนำจ่าย", en: "Out for delivery", tone: "info" },
  delivered: { step: 4, th: "นำจ่ายสำเร็จ", en: "Delivered", tone: "success" },
  failed_attempt: { step: -1, th: "นำจ่ายไม่สำเร็จ", en: "Delivery attempt failed", tone: "warning" },
  returned: { step: -1, th: "ส่งคืนผู้ส่ง", en: "Returned to sender", tone: "warning" },
  exception: { step: -1, th: "พัสดุมีปัญหา", en: "Exception", tone: "danger" },
  not_found: { step: 0, th: "ไม่พบข้อมูลพัสดุ", en: "Not found", tone: "muted" },
};

/** The four steps of the progress bar. */
export const STEPS = [
  { status: "accepted", th: "รับพัสดุ", en: "Picked up" },
  { status: "in_transit", th: "ระหว่างขนส่ง", en: "In transit" },
  { status: "out_for_delivery", th: "กำลังนำจ่าย", en: "Out for delivery" },
  { status: "delivered", th: "ส่งสำเร็จ", en: "Delivered" },
];

export const statusLabel = (status, locale = "th") => {
  const s = STATUSES[status] ?? STATUSES.pending;
  return locale === "en" ? s.en : s.th;
};

export const isFinal = (status) => status === "delivered" || status === "returned";

/**
 * Guesses a normalised status from free text, for carriers that only give a sentence.
 * Thai and English; checked from the most to the least specific.
 */
const TEXT_RULES = [
  ["returned", /ส่งคืน|ตีกลับ|คืนผู้ส่ง|return(ed)? to (sender|shipper)|returned/i],
  ["failed_attempt", /ไม่สำเร็จ|ไม่มีผู้รับ|ติดต่อผู้รับไม่ได้|นัดส่งใหม่|unsuccessful|failed|attempt|not delivered|recipient (not|un)available/i],
  ["delivered", /นำจ่ายสำเร็จ|จัดส่งสำเร็จ|ส่งสำเร็จ|ผู้รับได้รับ|เซ็นรับ|ลงนามรับ|delivered|signed (for|by)/i],
  ["out_for_delivery", /กำลังนำจ่าย|ระหว่างการนำจ่าย|ออกนำจ่าย|กำลังจัดส่ง|กำลังนำส่ง|out for delivery|with (the )?courier|on vehicle for delivery/i],
  ["exception", /ผิดปกติ|เสียหาย|สูญหาย|ระงับ|exception|damaged|lost|held|on hold/i],
  ["accepted", /รับฝาก|รับพัสดุ|เข้ารับ|รับเข้าระบบ|picked up|accepted|received by (the )?carrier|collected/i],
  ["info_received", /แจ้งข้อมูล|สร้างรายการ|เตรียมการฝากส่ง|label created|info(rmation)? received|shipment information|order (created|placed)/i],
  ["in_transit", /ระหว่างการขนส่ง|ระหว่างขนส่ง|ศูนย์คัดแยก|ถึงศูนย์|ออกจากศูนย์|ถึงสาขา|ที่ทำการ|in transit|hub|sort|depart|arriv|transit|processed/i],
];

export const statusFromText = (text) => {
  const t = String(text ?? "");
  for (const [status, re] of TEXT_RULES) if (re.test(t)) return status;
  return null;
};

/** Sorts events newest first and fills `status` from the latest event when it is missing. */
export const finalizeShipment = (shipment) => {
  const events = [...(shipment.events ?? [])].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
  const latest = events[0];
  const status = shipment.status ?? latest?.status ?? (events.length ? "in_transit" : "not_found");
  return {
    ...shipment,
    status,
    statusText: shipment.statusText ?? latest?.text ?? null,
    updatedAt: shipment.updatedAt ?? latest?.time ?? null,
    delivered: status === "delivered",
    events,
  };
};
