import React, { useCallback, useEffect, useRef, useState } from "react";
import { CARRIERS, detectCarrier, getCarrier, parseNumbers, trackingUrl } from "./core.js";
import { STATUSES, STEPS, statusLabel } from "./status.js";

const TEXT = {
  th: {
    label: "เลขพัสดุ",
    placeholder: "วางเลขพัสดุ คั่นด้วยเว้นวรรค จุลภาค หรือขึ้นบรรทัดใหม่",
    placeholderMore: "เพิ่มเลขพัสดุ",
    submit: "ตรวจสอบสถานะ",
    loading: "กำลังตรวจสอบ…",
    remove: "ลบ",
    carrier: "ขนส่ง",
    autoCarrier: "ไม่ทราบขนส่ง",
    tooMany: (max) => `ตรวจได้ครั้งละไม่เกิน ${max} เลข`,
    failed: "ตรวจสอบไม่สำเร็จ ลองใหม่อีกครั้ง",
    openCarrier: "ดูที่เว็บขนส่ง",
    openOn: (name) => `เปิดดูสถานะที่เว็บ ${name}`,
    receiver: "ผู้รับ",
    noEvents: "ยังไม่มีความเคลื่อนไหว",
    showAll: (n) => `ดูทั้งหมด (${n})`,
    showLess: "ย่อ",
    errors: {
      not_found: "ไม่พบข้อมูล เลขอาจยังไม่เข้าระบบ หรือเลือกขนส่งผิด",
      unsupported: "ดูสถานะของพัสดุนี้ได้ที่เว็บของขนส่ง",
      unknownCarrier: "ไม่ทราบว่าเป็นขนส่งเจ้าไหน ลองเลือกขนส่งที่ป้ายของเลขนี้",
      invalid: "รูปแบบเลขพัสดุไม่ถูกต้อง",
      provider_error: "ระบบของขนส่งไม่ตอบกลับ ลองใหม่ภายหลัง",
    },
  },
  en: {
    label: "Tracking numbers",
    placeholder: "Paste tracking numbers, separated by spaces, commas or new lines",
    placeholderMore: "Add another",
    submit: "Track",
    loading: "Tracking…",
    remove: "Remove",
    carrier: "Carrier",
    autoCarrier: "Unknown carrier",
    tooMany: (max) => `Up to ${max} numbers at a time`,
    failed: "Could not track right now. Please try again.",
    openCarrier: "Open on carrier site",
    openOn: (name) => `Track on ${name}`,
    receiver: "Received by",
    noEvents: "No updates yet",
    showAll: (n) => `Show all (${n})`,
    showLess: "Show less",
    errors: {
      not_found: "No record yet. The number may not be in the system, or the carrier is wrong.",
      unsupported: "Track this parcel on the carrier's website.",
      unknownCarrier: "Unknown carrier. Pick one on this number's chip.",
      invalid: "This does not look like a tracking number",
      provider_error: "The carrier did not respond. Please try later.",
    },
  },
};

let uid = 0;
const useId = () => {
  const ref = useRef(null);
  if (ref.current === null) ref.current = `tds-${++uid}`;
  return ref.current;
};

const pad = (n) => String(n).padStart(2, "0");
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2 ต.ค. 69 14:05" / "2 Oct 2026 14:05", in Thai time whatever the viewer's time zone. */
export const formatTime = (iso, locale = "th") => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso ?? "";
  const d = new Date(ms + 7 * 3600e3); // Asia/Bangkok has no daylight saving
  const day = d.getUTCDate();
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (locale === "en") return `${day} ${EN_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${time}`;
  return `${day} ${THAI_MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear() + 543).slice(-2)} ${time}`;
};

/** A coloured mark with the carrier's initials, so no logo files are needed. */
export const CarrierBadge = ({ carrier, locale = "th", className }) => {
  const c = getCarrier(carrier);
  if (!c) return null;
  return (
    <span className={["tds-carrier", className].filter(Boolean).join(" ")}>
      <span className="tds-carrier-mark" style={{ "--tds-carrier": c.color }} aria-hidden="true">
        {c.short}
      </span>
      {locale === "en" ? c.en : c.th}
    </span>
  );
};

export const StatusBadge = ({ status, locale = "th" }) => (
  <span className={`tds-status tds-status--${STATUSES[status]?.tone ?? "muted"}`}>{statusLabel(status, locale)}</span>
);

const Progress = ({ status, locale }) => {
  const s = STATUSES[status] ?? STATUSES.pending;
  // off the happy path (failed / returned / exception): keep the bar where the parcel got to
  if (s.step < 0) return null;
  return (
    <ol className="tds-steps" aria-label={statusLabel(status, locale)}>
      {STEPS.map((step, i) => {
        const state = i + 1 < s.step ? "done" : i + 1 === s.step ? "current" : "todo";
        return (
          <li key={step.status} className={`tds-step tds-step--${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="tds-step-dot" aria-hidden="true" />
            <span className="tds-step-label">{locale === "en" ? step.en : step.th}</span>
          </li>
        );
      })}
    </ol>
  );
};

/** One parcel: status, progress bar and the event timeline. */
export const ShipmentCard = ({ shipment, locale = "th", eventsShown = 4, className }) => {
  const t = TEXT[locale === "en" ? "en" : "th"];
  const [open, setOpen] = useState(false);
  const events = shipment.events ?? [];
  const shown = open ? events : events.slice(0, eventsShown);
  const url = shipment.url ?? trackingUrl(shipment.carrier, shipment.number);
  const carrier = getCarrier(shipment.carrier);
  // no provider for this carrier: send the visitor to the carrier's own page instead
  const handOff = shipment.error === "unsupported" && url;
  const error = shipment.error && (shipment.error === "unsupported" && !shipment.carrier ? t.errors.unknownCarrier : t.errors[shipment.error]);
  return (
    <article className={["tds-card", `tds-card--${STATUSES[shipment.status]?.tone ?? "muted"}`, className].filter(Boolean).join(" ")}>
      <header className="tds-card-head">
        <div className="tds-card-id">
          <span className="tds-number">{shipment.number}</span>
          {shipment.carrier && <CarrierBadge carrier={shipment.carrier} locale={locale} />}
        </div>
        {!shipment.error && <StatusBadge status={shipment.status} locale={locale} />}
      </header>

      {handOff ? (
        <div className="tds-handoff">
          <p className="tds-card-error">{error}</p>
          <a className="tds-handoff-link" href={url} target="_blank" rel="noreferrer" style={{ "--tds-carrier": carrier?.color }}>
            {t.openOn(carrier ? (locale === "en" ? carrier.en : carrier.th) : "")} ↗
          </a>
        </div>
      ) : error ? (
        <p className="tds-card-error">{error}</p>
      ) : (
        <>
          <Progress status={shipment.status} locale={locale} />
          {shipment.receiver && (
            <p className="tds-receiver">
              {t.receiver}: <b>{shipment.receiver}</b>
            </p>
          )}
          {events.length ? (
            <ol className="tds-timeline">
              {shown.map((e, i) => (
                <li key={`${e.time}-${i}`} className={i === 0 ? "tds-event tds-event--latest" : "tds-event"}>
                  <time dateTime={e.time}>{formatTime(e.time, locale)}</time>
                  <span className="tds-event-text">{e.text || statusLabel(e.status, locale)}</span>
                  {e.location && <span className="tds-event-place">{e.location}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="tds-empty">{t.noEvents}</p>
          )}
        </>
      )}

      {(events.length > eventsShown || url) && !handOff && (
        <footer className="tds-card-foot">
          {events.length > eventsShown && (
            <button type="button" className="tds-link" onClick={() => setOpen(!open)}>
              {open ? t.showLess : t.showAll(events.length)}
            </button>
          )}
          {url && (
            <a className="tds-link" href={url} target="_blank" rel="noreferrer">
              {t.openCarrier} ↗
            </a>
          )}
        </footer>
      )}
    </article>
  );
};

/**
 * Turns `endpoint` or `track` into one function: (items) => Promise<Shipment[]>.
 * `endpoint` gets POST { items: [{ number, carrier }] } and answers { shipments: [...] }.
 */
const toTrackFn = (endpoint, track, headers) => {
  if (track) return track;
  if (!endpoint) return null;
  return async (items) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error(`Tracking request failed with ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : data.shipments;
  };
};

/**
 * State for tracking: `{ shipments, loading, error, run(items) }`.
 * Keeps only the answer to the latest call when several overlap.
 */
export const useTracking = ({ endpoint, track, headers, onResult } = {}) => {
  const [state, setState] = useState({ shipments: [], loading: false, error: null });
  const latest = useRef(0);
  const fn = toTrackFn(endpoint, track, headers);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const run = useCallback(async (items) => {
    const call = ++latest.current;
    // a bare number has no carrier: the server asks every carrier its format fits
    const list = items.map((i) => (typeof i === "string" ? { number: i, carrier: null } : i));
    if (!list.length) return setState({ shipments: [], loading: false, error: null });
    if (!fnRef.current) throw new Error("useTracking needs `endpoint` or `track`");
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const shipments = await fnRef.current(list);
      if (call !== latest.current) return;
      setState({ shipments, loading: false, error: null });
      onResultRef.current?.(shipments);
    } catch (error) {
      if (call !== latest.current) return;
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, []);

  return { ...state, run };
};

// `carrier` is what the chip shows: the best guess until the user picks one (`picked`) or the
// server finds which carrier has the parcel
const toItems = (value, carriers) =>
  parseNumbers(Array.isArray(value) ? value.join(" ") : value).map((number) => ({
    number,
    carrier: detectCarrier(number, { carriers })[0]?.id ?? null,
    picked: false,
  }));

/** Only a carrier the user picked is sent; otherwise the server tries every likely one. */
const toRequest = (items, carriers) =>
  items.map((i) => ({ number: i.number, carrier: i.picked ? i.carrier : null, ...(carriers && !i.picked && { carriers }) }));

/**
 * Tracking number field (one or many) with carrier detection, and the results underneath.
 * Pass `endpoint` (your server route) or `track` (any function that returns shipments).
 */
export const DeliveryStatus = ({
  endpoint,
  track,
  headers,
  defaultValue = "",
  autoTrack = false,
  max = 20,
  carriers,
  locale = "th",
  eventsShown = 4,
  onResult,
  className,
  style,
}) => {
  const t = TEXT[locale === "en" ? "en" : "th"];
  const id = useId();
  const [items, setItems] = useState(() => toItems(defaultValue, carriers));
  const [draft, setDraft] = useState("");
  const [warning, setWarning] = useState(null);
  const inputRef = useRef(null);
  const { shipments, loading, error, run: runTracking } = useTracking({
    endpoint,
    track,
    headers,
    onResult: (found) => {
      // show the carrier that actually had the parcel on chips the user did not set
      setItems((list) =>
        list.map((i) => {
          const s = found.find((f) => f.number === i.number);
          return !i.picked && s?.carrier && !s.error ? { ...i, carrier: s.carrier } : i;
        }),
      );
      onResult?.(found);
    },
  });
  const run = (list) => runTracking(toRequest(list, carriers));
  const choices = carriers ? CARRIERS.filter((c) => carriers.includes(c.id)) : CARRIERS;

  // only the first render: defaultValue is a starting point, not a controlled value
  useEffect(() => {
    if (autoTrack && items.length) run(items);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (text) => {
    const found = toItems(text, carriers).filter((n) => !items.some((i) => i.number === n.number));
    const room = Math.max(0, max - items.length);
    setWarning(found.length > room ? t.tooMany(max) : null);
    const next = [...items, ...found.slice(0, room)];
    setItems(next);
    return next;
  };

  const commit = () => {
    const next = draft.trim() ? add(draft) : items;
    setDraft("");
    return next;
  };

  const submit = (e) => {
    e?.preventDefault();
    const next = commit();
    if (next.length) run(next);
  };

  const remove = (number) => {
    setItems(items.filter((i) => i.number !== number));
    setWarning(null);
  };

  const setCarrier = (number, carrier) =>
    setItems(items.map((i) => (i.number === number ? { ...i, carrier: carrier || null, picked: !!carrier } : i)));

  return (
    <div className={["tds", className].filter(Boolean).join(" ")} style={style}>
      <form className="tds-form" onSubmit={submit} noValidate>
        <label className="tds-label" htmlFor={`${id}-input`}>
          {t.label}
        </label>
        <div className="tds-box" onClick={(e) => e.target === e.currentTarget && inputRef.current?.focus()}>
          {items.map((item) => {
            const candidates = detectCarrier(item.number, { carriers });
            return (
              <span key={item.number} className="tds-chip">
                <span className="tds-chip-number">{item.number}</span>
                <select
                  className="tds-chip-carrier"
                  aria-label={`${t.carrier} ${item.number}`}
                  value={item.carrier ?? ""}
                  onChange={(e) => setCarrier(item.number, e.target.value)}
                  style={{ "--tds-carrier": getCarrier(item.carrier)?.color }}
                >
                  <option value="">{t.autoCarrier}</option>
                  {/* the likely carriers first, then the rest */}
                  {[...candidates, ...choices.filter((c) => !candidates.includes(c))].map((c) => (
                    <option key={c.id} value={c.id}>
                      {locale === "en" ? c.en : c.th}
                    </option>
                  ))}
                </select>
                <button type="button" className="tds-chip-remove" aria-label={`${t.remove} ${item.number}`} onClick={() => remove(item.number)}>
                  ×
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            id={`${id}-input`}
            className="tds-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={items.length ? t.placeholderMore : t.placeholder}
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              // a separator turns what was typed into a chip
              if (/[\s,;]$/.test(v) && v.trim()) {
                add(v);
                setDraft("");
              } else setDraft(v);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (/[\s,;]/.test(text.trim())) {
                e.preventDefault();
                add(draft + text);
                setDraft("");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !draft && items.length) remove(items[items.length - 1].number);
            }}
            onBlur={() => draft.trim() && commit()}
          />
        </div>
        <div className="tds-actions">
          {(warning || error) && (
            <span className="tds-warning" role="alert">
              {warning ?? t.failed}
            </span>
          )}
          <button type="submit" className="tds-submit" disabled={loading || (!items.length && !draft.trim())}>
            {loading ? t.loading : t.submit}
          </button>
        </div>
      </form>

      {shipments.length > 0 && (
        <div className="tds-results" aria-live="polite" aria-busy={loading}>
          {shipments.map((s) => (
            <ShipmentCard key={s.number} shipment={s} locale={locale} eventsShown={eventsShown} />
          ))}
        </div>
      )}
    </div>
  );
};
