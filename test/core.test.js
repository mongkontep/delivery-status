import test from "node:test";
import assert from "node:assert/strict";
import { CARRIERS, cleanNumber, detectCarrier, isS10, parseNumbers, s10CheckDigit, trackingUrl, statusFromText } from "../src/core.js";
import { finalizeShipment } from "../src/status.js";

const ids = (n) => detectCarrier(n).map((c) => c.id);

test("S10 check digit", () => {
  assert.equal(s10CheckDigit("47312482"), 9); // UPU example
  assert.equal(isS10("EF582568151TH"), true);
  assert.equal(isS10("EF582568152TH"), false);
  assert.equal(isS10("RR473124829DE"), true);
});

test("cleanNumber and parseNumbers", () => {
  assert.equal(cleanNumber(" ef-5825 6815 1th "), "EF582568151TH");
  assert.equal(cleanNumber("๘๒๐๑๑๒๓๔๕๖๗๘"), "820112345678");
  assert.deepEqual(parseNumbers("EF582568151TH, kex20898721369\nEF582568151TH;12"), ["EF582568151TH", "KEX20898721369"]);
  assert.deepEqual(parseNumbers(""), []);
});

test("detectCarrier", () => {
  assert.equal(ids("EF582568151TH")[0], "thailand-post");
  assert.equal(ids("EF582568152TH")[0], undefined); // wrong check digit is not Thailand Post
  assert.equal(ids("RR473124829DE")[0], "thailand-post"); // from abroad, delivered by Thailand Post
  assert.equal(ids("KEX20898721369")[0], "kerry");
  assert.equal(ids("TH0915EKX18T2D")[0], "flash");
  assert.equal(ids("TH012345678912A")[0], "spx");
  assert.equal(ids("NVTH12345678")[0], "ninjavan");
  assert.equal(ids("1Z999AA10123456784")[0], "ups");
  assert.deepEqual(ids("820112345678").slice(0, 2), ["jt", "fedex"]);
  assert.equal(ids("1234567890")[0], "dhl");
  assert.deepEqual(ids("ABCDEFGH"), []);
  assert.deepEqual(detectCarrier("820112345678", { carriers: ["fedex"] }).map((c) => c.id), ["fedex"]);
});

test("carriers are well formed", () => {
  assert.equal(new Set(CARRIERS.map((c) => c.id)).size, CARRIERS.length);
  for (const c of CARRIERS) assert.ok(c.th && c.en && c.short && /^#[0-9a-f]{6}$/i.test(c.color), c.id);
  assert.equal(trackingUrl("thailand-post", "ef582568151th"), "https://track.thailandpost.co.th/?trackNumber=EF582568151TH");
  assert.equal(trackingUrl("lex", "LEX123"), null);
  assert.equal(trackingUrl("nope", "X"), null);
});

test("statusFromText", () => {
  assert.equal(statusFromText("นำจ่ายสำเร็จ"), "delivered");
  assert.equal(statusFromText("นำจ่ายไม่สำเร็จ"), "failed_attempt");
  assert.equal(statusFromText("อยู่ระหว่างการนำจ่าย"), "out_for_delivery");
  assert.equal(statusFromText("ส่งคืนต้นทาง"), "returned");
  assert.equal(statusFromText("Arrived at sorting hub"), "in_transit");
  assert.equal(statusFromText("Delivered, signed by SOMCHAI"), "delivered");
  assert.equal(statusFromText("hello"), null);
});

test("finalizeShipment sorts events and fills status", () => {
  const s = finalizeShipment({
    number: "X",
    events: [
      { time: "2026-10-01T03:00:00Z", status: "accepted", text: "a" },
      { time: "2026-10-02T03:00:00Z", status: "in_transit", text: "b" },
    ],
  });
  assert.equal(s.status, "in_transit");
  assert.equal(s.events[0].text, "b");
  assert.equal(s.updatedAt, "2026-10-02T03:00:00Z");
  assert.equal(s.delivered, false);
  assert.equal(finalizeShipment({ number: "Y", events: [] }).status, "not_found");
});
