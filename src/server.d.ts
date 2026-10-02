import type { CarrierId, Shipment, ShipmentStatus, TrackItem } from "./core";

export * from "./core";

export type Provider = {
  name?: string;
  /** carriers this provider answers for */
  carriers?: CarrierId[];
  /** also takes numbers whose carrier is unknown */
  acceptsUnknown?: boolean;
  /** answers for any carrier (a marketplace: its orders go with many carriers) */
  anyCarrier?: boolean;
  /** the same number can come twice with different carriers; answer in the same order */
  track(items: { number: string; carrier: CarrierId | null }[]): Promise<Partial<Shipment>[]>;
};

export type ThailandPostOptions = {
  /** the token from the Thailand Post developer dashboard */
  token: string;
  language?: "TH" | "EN" | "CN";
  fetch?: typeof fetch;
};

export type TrackingMoreOptions = {
  apiKey: string;
  language?: string;
  /** parallel requests (default 4) */
  concurrency?: number;
  fetch?: typeof fetch;
};

type WithFetch = { fetch?: typeof fetch };

export type FlashOptions = WithFetch & { mchId: string; key: string; sandbox?: boolean };
export type NinjaVanOptions = WithFetch & { clientId: string; clientSecret: string; country?: string; sandbox?: boolean; concurrency?: number };
export type JtOptions = WithFetch & { apiAccount: string; privateKey: string; baseUrl?: string; sandbox?: boolean };
export type DhlEcommerceOptions = WithFetch & {
  clientId: string;
  password: string;
  sandbox?: boolean;
  soldToAccountId?: string;
  pickupAccountId?: string;
  messageVersion?: string;
  language?: string;
};

/** The order a tracking number belongs to, in the marketplace. */
export type MarketplaceOrder = { orderId: string; packageId?: string; shopId?: string | number; shopCipher?: string };

/** Functions a marketplace provider needs from your code. */
export type MarketplaceHooks = {
  /** your orders table: tracking number → order, or null when it is not a marketplace order */
  findOrder(number: string): Promise<MarketplaceOrder | null> | MarketplaceOrder | null;
  /** a current access token for the shop (you store it and refresh it) */
  getAccessToken(context: { shopId?: string | number }): Promise<string> | string;
  concurrency?: number;
};

export type ShopeeOptions = WithFetch & MarketplaceHooks & { partnerId: string | number; partnerKey: string; shopId?: string | number; sandbox?: boolean };
export type LazadaOptions = WithFetch & MarketplaceHooks & { appKey: string; appSecret: string; locale?: string };
export type TikTokShopOptions = WithFetch & MarketplaceHooks & { appKey: string; appSecret: string; shopCipher?: string };

export type AggregatorOptions = WithFetch & { apiKey: string; concurrency?: number };

export type EnvVariable = { key: string; required?: boolean; note: string };
export type EnvProvider = {
  name: string;
  kind: "carrier" | "marketplace" | "post" | "aggregator";
  title: string;
  env: EnvVariable[];
  /** functions that must come from code, in createTrackerFromEnv(env, { hooks }) */
  hooks?: ("findOrder" | "getAccessToken")[];
};

export type TrackerFromEnvOptions = Omit<TrackerOptions, "thailandPost" | "trackingMore"> & {
  /** functions for marketplaces, e.g. { shopee: { findOrder, getAccessToken } } */
  hooks?: Partial<Record<"shopee" | "lazada" | "tiktokShop", MarketplaceHooks>>;
  fetch?: typeof fetch;
};

export type TrackerOptions = {
  thailandPost?: ThailandPostOptions | Provider;
  trackingMore?: TrackingMoreOptions | Provider;
  /** your own providers, tried before the built-in ones */
  providers?: Provider[];
  /** most numbers per request (default 20) */
  max?: number;
  /** a number whose format fits several carriers is tried with up to this many (default 3) */
  maxCandidates?: number;
  /** keep good answers this long to save quota (default 300) */
  cacheSeconds?: number;
};

export type TrackInput = (string | TrackItem)[] | { items?: (string | TrackItem)[]; numbers?: (string | TrackItem)[] };

export type Tracker = {
  /** names of the providers in use, in the order they are tried */
  providers: string[];
  /** one Shipment per distinct number, in order; problems are in `error`, not thrown */
  track(input: TrackInput): Promise<Shipment[]>;
  /** fetch-style route: Next.js app router, Hono, Cloudflare, Deno */
  handleRequest(request: Request): Promise<Response>;
  /** Express / Firebase Functions */
  expressHandler(req: { method: string; body: unknown }, res: { status(code: number): { json(body: unknown): unknown } }): Promise<void>;
};

export declare class TrackingError extends Error {
  code: "config" | "bad_request" | "too_many" | "provider_error" | string;
  details?: unknown;
}

export declare function createTracker(options?: TrackerOptions): Tracker;
/** Switches on every provider whose variables are set in `env` (process.env by default). */
export declare function createTrackerFromEnv(env?: Record<string, string | undefined>, options?: TrackerFromEnvOptions): Tracker;
export declare const ENV_PROVIDERS: EnvProvider[];
export declare function checkEnv(
  env?: Record<string, string | undefined>,
  hooks?: TrackerFromEnvOptions["hooks"],
): { enabled: string[]; incomplete: { name: string; missing: string[] }[] };
export declare function providersFromEnv(env?: Record<string, string | undefined>, fetchFn?: typeof globalThis.fetch, hooks?: TrackerFromEnvOptions["hooks"]): Provider[];

export declare function flash(options: FlashOptions): Provider;
export declare function flashSign(params: Record<string, string>, key: string): Promise<string>;
export declare function ninjaVan(options: NinjaVanOptions): Provider;
export declare function jt(options: JtOptions): Provider;
export declare function jtDigest(bizContent: string, privateKey: string): string;
export declare function dhlEcommerce(options: DhlEcommerceOptions): Provider;
export declare function shopee(options: ShopeeOptions): Provider;
export declare function lazada(options: LazadaOptions): Provider;
export declare function tiktokShop(options: TikTokShopOptions): Provider;
export declare function shopeeRefreshToken(options: {
  partnerId: string | number;
  partnerKey: string;
  shopId: string | number;
  refreshToken: string;
  sandbox?: boolean;
  fetch?: typeof fetch;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>;
export declare function lazadaRefreshToken(options: {
  appKey: string;
  appSecret: string;
  refreshToken: string;
  fetch?: typeof fetch;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresIn: number }>;
export declare function marketplaceStatus(code: string): ShipmentStatus | null;
export declare function track17(options: AggregatorOptions): Provider;
export declare function track123(options: { apiSecret: string; fetch?: typeof fetch }): Provider;
export declare function afterShip(options: AggregatorOptions & { version?: string }): Provider;
export declare function ship24(options: AggregatorOptions): Provider;
export declare function statusFromText(text: string): ShipmentStatus | null;
export declare function thailandPost(options: ThailandPostOptions): Provider;
export declare function trackingMore(options: TrackingMoreOptions): Provider;
export declare function thailandPostStatus(code: string | number): ShipmentStatus | null;
export declare function parseThailandPostDate(text: string): string | null;
