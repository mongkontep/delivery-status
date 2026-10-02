// J&T Express open platform (JMS): https://open.jtexpress.co (Thailand runs the same platform).
// apiAccount and privateKey come with a certified account; ask J&T Thailand sales.
// The production host for Thailand is not published, so it can be set with `baseUrl` / JT_BASE_URL.
import { statusFromText } from "../status.js";
import { TrackingError, chunk, localToIso, md5, readJson, toBase64 } from "./util.js";

const BASE = {
  production: "https://openapi.jtexpress.co.th/webopenplatformapi/api",
  sandbox: "https://demoopenapi.jtexpress.co.th/webopenplatformapi/api",
};

/** Header `digest`: Base64 of the raw MD5 of (bizContent JSON + privateKey). */
export const jtDigest = (bizContent, privateKey) => toBase64(md5(bizContent + privateKey));

export const jt = ({ apiAccount, privateKey, baseUrl, sandbox = false, fetch: fetchFn = globalThis.fetch } = {}) => {
  if (!apiAccount || !privateKey) throw new TrackingError("config", "jt needs `apiAccount` and `privateKey`");
  const base = (baseUrl || (sandbox ? BASE.sandbox : BASE.production)).replace(/\/$/, "");

  const request = async (numbers) => {
    const bizContent = JSON.stringify({ billCodes: numbers.join(",") });
    const res = await fetchFn(`${base}/logistics/trace`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apiAccount: String(apiAccount),
        digest: jtDigest(bizContent, privateKey),
        timestamp: String(Date.now()),
      },
      body: new URLSearchParams({ bizContent }).toString(),
    });
    const data = await readJson(res);
    if (String(data.code) !== "1") throw new TrackingError("provider_error", data.msg || `J&T code ${data.code}`, data);
    return data.data ?? [];
  };

  return {
    name: "jt",
    carriers: ["jt"],
    async track(items) {
      const found = new Map();
      // at most 30 waybills per call
      for (const group of chunk([...new Set(items.map((i) => i.number))], 30)) {
        for (const b of await request(group)) found.set(b.billCode, b);
      }
      return items.map((it) => {
        const b = found.get(it.number);
        if (!b?.details?.length) return { number: it.number, carrier: "jt", error: "not_found", events: [] };
        const events = b.details.map((d) => ({
          time: localToIso(d.scanTime),
          status: statusFromText(`${d.scanType ?? ""} ${d.desc ?? ""}`) ?? "in_transit",
          text: d.desc ?? d.scanType ?? "",
          location: [d.scanNetworkName, d.scanNetworkCity, d.scanNetworkProvince].filter(Boolean).join(", "),
          code: d.scanCode,
        }));
        return { number: it.number, carrier: "jt", events };
      });
    },
  };
};
