// Writes .env.example from ENV_PROVIDERS, so the file always matches the code: npm run env:example
import { writeFileSync } from "node:fs";
import { ENV_PROVIDERS } from "../src/providers/env.js";

const KINDS = {
  carrier: "API ของขนส่งเอง: ต้องมีบัญชีร้านค้ากับขนส่ง ดูได้เฉพาะพัสดุที่ร้านส่งเอง",
  marketplace: "Marketplace: ค้นจากเลขคำสั่งซื้อ ต้องส่ง hooks findOrder และ getAccessToken ในโค้ดด้วย",
  post: "ไปรษณีย์ไทย: ฟรี ใช้ได้กับทุกเลข",
  aggregator: "Aggregator: เสียเงิน ใช้ได้ทุกขนส่ง ถูกถามเป็นลำดับสุดท้าย",
};

const out = [
  "# @inverz/delivery-status: ตัวแปรสำหรับ createTrackerFromEnv()",
  "# ใส่เฉพาะ provider ที่ใช้ ถ้าใส่ตัวที่ไม่ได้เขียนว่า (optional) ครบ provider นั้นจะเปิดเอง",
  "# ลำดับในไฟล์คือลำดับที่ถูกถาม ตัวถัดไปถูกถามเฉพาะเมื่อตัวก่อนหน้าไม่มีข้อมูลพัสดุ",
  "# ใช้ฝั่ง server เท่านั้น ห้ามใส่ใน VITE_ / NEXT_PUBLIC_",
];
let kind;
for (const p of ENV_PROVIDERS) {
  if (p.kind !== kind) {
    kind = p.kind;
    out.push("", "# " + "=".repeat(70), `# ${KINDS[kind]}`, "# " + "=".repeat(70));
  }
  out.push("", `# ${p.title}${p.hooks ? `  (hooks: ${p.hooks.join(", ")})` : ""}`);
  for (const v of p.env) out.push(`#${v.required ? "" : " (optional)"} ${v.note}`, `${v.key}=`);
}
writeFileSync(new URL("../.env.example", import.meta.url), out.join("\n") + "\n");
