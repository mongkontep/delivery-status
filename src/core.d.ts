export type CarrierId =
  | "thailand-post"
  | "kerry"
  | "flash"
  | "jt"
  | "spx"
  | "lex"
  | "ninjavan"
  | "best"
  | "scg"
  | "dhl-ecommerce"
  | "nim"
  | "dhl"
  | "fedex"
  | "ups";

export type Carrier = {
  id: CarrierId;
  th: string;
  en: string;
  /** initials shown on the badge */
  short: string;
  color: string;
  /** the carrier's tracking page; "{n}" is replaced by the number */
  url: string | null;
  /** TrackingMore courier code */
  trackingMore: string | null;
  patterns: [RegExp | ((number: string) => boolean), number][];
};

export type ShipmentStatus =
  | "pending"
  | "info_received"
  | "accepted"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_attempt"
  | "returned"
  | "exception"
  | "not_found";

export type ShipmentError = "not_found" | "unsupported" | "invalid" | "provider_error";

export type TrackingEvent = {
  /** ISO 8601 */
  time: string | null;
  status: ShipmentStatus;
  /** the carrier's own words */
  text: string;
  location?: string;
  /** the carrier's status code, when it has one */
  code?: string;
};

export type Shipment = {
  number: string;
  carrier: CarrierId | null;
  status: ShipmentStatus;
  /** text of the latest event */
  statusText: string | null;
  /** ISO 8601 time of the latest event */
  updatedAt: string | null;
  delivered: boolean;
  /** newest first */
  events: TrackingEvent[];
  receiver?: string | null;
  url?: string | null;
  error?: ShipmentError;
};

export type TrackItem = {
  number: string;
  /** a carrier the user picked: only this one is asked */
  carrier?: CarrierId | null;
  /** with no `carrier`: only try these */
  carriers?: CarrierId[];
};

export type StatusInfo = { step: number; th: string; en: string; tone: "muted" | "info" | "success" | "warning" | "danger" };

export declare const CARRIERS: Carrier[];
export declare const STATUSES: Record<ShipmentStatus, StatusInfo>;
export declare const STEPS: { status: ShipmentStatus; th: string; en: string }[];

export declare function cleanNumber(text: string): string;
export declare function isTrackingNumber(text: string): boolean;
export declare function parseNumbers(text: string): string[];
export declare function getCarrier(carrier: CarrierId | Carrier | string | null | undefined): Carrier | null;
export declare function detectCarrier(number: string, options?: { carriers?: CarrierId[] }): Carrier[];
export declare function trackingUrl(carrier: CarrierId | Carrier | string | null | undefined, number: string): string | null;
export declare function isS10(number: string): boolean;
export declare function s10CheckDigit(serial: string): number;
export declare function statusLabel(status: ShipmentStatus, locale?: "th" | "en"): string;
export declare function statusFromText(text: string): ShipmentStatus | null;
export declare function isFinal(status: ShipmentStatus): boolean;
