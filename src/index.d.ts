import type { CSSProperties, ReactElement } from "react";
import type { CarrierId, Shipment, ShipmentStatus, TrackItem } from "./core";

export * from "./core";

/** `carrier` is set only when the user picked one */
export type TrackFn = (items: TrackItem[]) => Promise<Shipment[]>;

export type DeliveryStatusProps = {
  /** your server route: gets POST { items: [{ number, carrier }] }, answers { shipments } */
  endpoint?: string;
  /** or any function that returns shipments (instead of `endpoint`) */
  track?: TrackFn;
  /** extra headers for `endpoint`, e.g. an auth token */
  headers?: Record<string, string>;
  /** numbers to start with: a string (any separator) or a list */
  defaultValue?: string | string[];
  /** track `defaultValue` right away */
  autoTrack?: boolean;
  /** most numbers at once (default 20) */
  max?: number;
  /** limit detection and the carrier list to these */
  carriers?: CarrierId[];
  locale?: "th" | "en";
  /** events shown before "show all" (default 4) */
  eventsShown?: number;
  onResult?: (shipments: Shipment[]) => void;
  className?: string;
  style?: CSSProperties;
};

export type ShipmentCardProps = {
  shipment: Shipment;
  locale?: "th" | "en";
  eventsShown?: number;
  className?: string;
};

export type UseTrackingOptions = {
  endpoint?: string;
  track?: TrackFn;
  headers?: Record<string, string>;
  onResult?: (shipments: Shipment[]) => void;
};

export type UseTracking = {
  shipments: Shipment[];
  loading: boolean;
  error: unknown;
  /** numbers alone are matched to their likely carrier */
  run(items: (string | TrackItem)[]): Promise<void>;
};

export declare function DeliveryStatus(props: DeliveryStatusProps): ReactElement;
export declare function ShipmentCard(props: ShipmentCardProps): ReactElement;
export declare function CarrierBadge(props: { carrier: CarrierId | null | undefined; locale?: "th" | "en"; className?: string }): ReactElement | null;
export declare function StatusBadge(props: { status: ShipmentStatus; locale?: "th" | "en" }): ReactElement;
export declare function useTracking(options?: UseTrackingOptions): UseTracking;
export declare function formatTime(iso: string, locale?: "th" | "en"): string;
