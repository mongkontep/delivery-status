// Carriers used in Thailand. Number patterns are best guesses from public samples (carriers do not
// publish them, and several share the same shape), so detection returns a ranked list and the user
// can always pick the carrier by hand.
//
//   id           our id, also what the server and the React component pass around
//   short/color  the badge (initials on the brand colour) so no logo files are shipped
//   url          the carrier's own tracking page; with "{n}" it opens on the number
//   trackingMore courier code on TrackingMore (api.trackingmore.com/v4)
//   track17 / track123 / afterShip  the same on 17TRACK (numeric), Track123 and AfterShip; null when
//                the service lists no code for it (the number then goes without one, to auto-detect)
//   eTrackings   courier key on eTrackings (api.etrackings.com/api/v3); null where it is not supported
//   patterns     [regex, score]; higher score wins when several carriers match

/** S10 (UPU) check digit: weights 8 6 4 2 3 5 9 7, then 11 − sum mod 11 (10 → 0, 11 → 5). */
export const s10CheckDigit = (serial) => {
  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  const sum = [...serial].reduce((s, d, i) => s + Number(d) * weights[i], 0);
  const c = 11 - (sum % 11);
  return c === 10 ? 0 : c === 11 ? 5 : c;
};

/** "EF582568151TH": 2 letters, 8 digits, check digit, country. Thailand Post and every UPU post use it. */
export const isS10 = (number) => {
  const m = /^[A-Z]{2}(\d{8})(\d)[A-Z]{2}$/.exec(number);
  return !!m && s10CheckDigit(m[1]) === Number(m[2]);
};

export const CARRIERS = [
  {
    id: "thailand-post",
    th: "ไปรษณีย์ไทย",
    en: "Thailand Post",
    short: "TP",
    color: "#d71920",
    url: "https://track.thailandpost.co.th/?trackNumber={n}",
    trackingMore: "thailand-post",
    track17: 20041,
    track123: "thailand-post",
    afterShip: "thailand-post",
    eTrackings: null,
    // check digit makes this one reliable; parcels from abroad keep their origin's country letters
    patterns: [[(n) => isS10(n) && n.endsWith("TH"), 100], [isS10, 80]],
  },
  {
    id: "kerry",
    th: "KEX (Kerry Express)",
    en: "KEX (Kerry Express)",
    short: "KEX",
    color: "#f47920",
    url: "https://th.kex-express.com/th/track/?track={n}",
    trackingMore: "kerryexpress-th",
    track17: 101405,
    track123: "kerryexpressth",
    afterShip: null,
    eTrackings: "kex-express",
    patterns: [[/^KEX[0-9A-Z]{8,14}$/, 90], [/^(KX\d{11}|TBK[0-9A-Z]{6,})$/, 60]],
  },
  {
    id: "flash",
    th: "Flash Express",
    en: "Flash Express",
    short: "FL",
    color: "#e3a600",
    url: "https://www.flashexpress.co.th/fle/tracking?se={n}",
    trackingMore: "flashexpress",
    track17: 100235,
    track123: "flashexpress",
    afterShip: "flashexpress",
    eTrackings: "flash-express",
    // TH + 11–12 letters and digits, with at least one letter after "TH" (SPX is all digits there)
    patterns: [[/^TH(?=[0-9A-Z]*[A-Z])[0-9A-Z]{11,12}$/, 70]],
  },
  {
    id: "jt",
    th: "J&T Express",
    en: "J&T Express",
    short: "J&T",
    color: "#d0121b",
    url: "https://www.jtexpress.co.th/service/track?waybillNo={n}",
    trackingMore: "jt-express-th",
    track17: 100271,
    track123: "jtexpressth",
    afterShip: "jt-express-th",
    eTrackings: "jt-express",
    patterns: [[/^8\d{11}$/, 60], [/^\d{12}$/, 40]],
  },
  {
    id: "spx",
    th: "SPX Express (Shopee)",
    en: "SPX Express (Shopee)",
    short: "SPX",
    color: "#ee4d2d",
    url: "https://spx.co.th/",
    trackingMore: "spx-th",
    track17: 100410,
    track123: "shopee-xpress-th",
    afterShip: "spx-th",
    eTrackings: "shopee-express",
    patterns: [[/^TH\d{12}[A-Z]$/, 75], [/^SPXTH\d{10,14}$/, 85]],
  },
  {
    id: "lex",
    th: "LEX (Lazada)",
    en: "LEX (Lazada)",
    short: "LEX",
    color: "#1a2b88",
    url: null,
    trackingMore: "lgs",
    track17: 101326,
    track123: null,
    afterShip: "lex-th",
    eTrackings: null,
    patterns: [[/^(LEX|LX)[0-9A-Z]{8,}$/, 70]],
  },
  {
    id: "ninjavan",
    th: "Ninja Van",
    en: "Ninja Van",
    short: "NV",
    color: "#c1002c",
    url: "https://www.ninjavan.co/th-th/tracking?id={n}",
    trackingMore: "ninjavan-th",
    track17: 100128,
    track123: "ninjavan-th",
    afterShip: "ninjavan-thai",
    eTrackings: "ninja-van",
    patterns: [[/^NVTH[0-9A-Z]{6,}$/, 95]],
  },
  {
    id: "best",
    th: "BEST Express",
    en: "BEST Express",
    short: "BE",
    color: "#c8102e",
    url: null,
    trackingMore: "best-th",
    track17: 101196,
    track123: null,
    afterShip: null,
    eTrackings: "best-express",
    patterns: [],
  },
  {
    id: "scg",
    th: "SCG Express",
    en: "SCG Express",
    short: "SCG",
    color: "#e2231a",
    url: "https://www.scgexpress.co.th/en/tracking/?tracking_search={n}",
    trackingMore: "scg-express",
    track17: null,
    track123: null,
    afterShip: null,
    eTrackings: "scg-express",
    patterns: [[/^\d{7,11}$/, 20]],
  },
  {
    id: "dhl-ecommerce",
    th: "DHL eCommerce",
    en: "DHL eCommerce",
    short: "DHL",
    color: "#d40511",
    url: "https://ecommerceportal.dhl.com/track/?locale=th_TH",
    trackingMore: "dhlecommerce-asia",
    track17: 7048,
    track123: "dhl-ecommerce-asia",
    afterShip: "dhl-global-mail-asia",
    eTrackings: "dhl-ecommerce",
    patterns: [],
  },
  {
    id: "nim",
    th: "นิ่มเอ็กซ์เพรส",
    en: "Nim Express",
    short: "NIM",
    color: "#f26522",
    url: null,
    trackingMore: null,
    track17: null,
    track123: null,
    afterShip: null,
    eTrackings: "nim-express",
    patterns: [],
  },
  {
    id: "dhl",
    th: "DHL Express",
    en: "DHL Express",
    short: "DHL",
    color: "#d40511",
    url: "https://www.dhl.com/th-en/home/tracking.html?tracking-id={n}",
    trackingMore: "dhl",
    track17: 100001,
    track123: "dhl",
    afterShip: "dhl",
    eTrackings: null,
    patterns: [[/^\d{10}$/, 45]],
  },
  {
    id: "fedex",
    th: "FedEx",
    en: "FedEx",
    short: "FX",
    color: "#4d148c",
    url: "https://www.fedex.com/fedextrack/?trknbr={n}",
    trackingMore: "fedex",
    track17: 100003,
    track123: "fedex",
    afterShip: "fedex",
    eTrackings: null,
    patterns: [[/^(\d{15}|\d{20}|\d{22})$/, 50], [/^\d{12}$/, 30]],
  },
  {
    id: "ups",
    th: "UPS",
    en: "UPS",
    short: "UPS",
    color: "#4b2e1f",
    url: "https://www.ups.com/track?tracknum={n}",
    trackingMore: "ups",
    track17: 100002,
    track123: "ups",
    afterShip: "ups",
    eTrackings: null,
    patterns: [[/^1Z[0-9A-Z]{16}$/, 100]],
  },
];
