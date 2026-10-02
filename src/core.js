// Tracking number helpers. No React and no network here: "@inverz/delivery-status/core".
import { CARRIERS } from "./carriers.js";

export { CARRIERS, isS10, s10CheckDigit } from "./carriers.js";
export { STATUSES, STEPS, statusLabel, statusFromText, isFinal } from "./status.js";

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** Upper case, Thai digits to Arabic, drops spaces and dashes: "ef 5825-6815 1th" → "EF582568151TH". */
export const cleanNumber = (text) =>
  String(text ?? "")
    .replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)))
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");

/** Letters and digits, 6–40 long. Says nothing about whether the number exists. */
export const isTrackingNumber = (text) => /^[0-9A-Z]{6,40}$/.test(cleanNumber(text));

/**
 * Splits pasted text into tracking numbers: by new line, comma, semicolon or space.
 * Cleans each one, drops anything that cannot be a tracking number and removes repeats.
 * Spaces inside a number ("EF 5825 6815 1TH") cannot be told apart from a list, so they split too.
 */
export const parseNumbers = (text) => {
  const seen = new Set();
  for (const part of String(text ?? "").split(/[\s,;|]+/)) {
    const n = cleanNumber(part);
    if (isTrackingNumber(n)) seen.add(n);
  }
  return [...seen];
};

/** A carrier by id, or the carrier object itself. */
export const getCarrier = (carrier) => (carrier && typeof carrier === "object" ? carrier : CARRIERS.find((c) => c.id === carrier) ?? null);

const test = (pattern, n) => (typeof pattern === "function" ? pattern(n) : pattern.test(n));

/**
 * Carriers whose number format fits, most likely first: detectCarrier("EF582568151TH") → [thailand-post].
 * An empty list means the format is unknown, not that the number is wrong.
 */
export const detectCarrier = (number, { carriers } = {}) => {
  const n = cleanNumber(number);
  const list = carriers ? CARRIERS.filter((c) => carriers.includes(c.id)) : CARRIERS;
  return list
    .map((c) => ({ c, score: Math.max(0, ...c.patterns.filter(([p]) => test(p, n)).map(([, s]) => s)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
};

/** The carrier's own tracking page for this number, or null when the carrier has none. */
export const trackingUrl = (carrier, number) => {
  const url = getCarrier(carrier)?.url;
  return url ? url.replace("{n}", encodeURIComponent(cleanNumber(number))) : null;
};
