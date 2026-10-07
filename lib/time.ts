// IST helpers. Asia/Kolkata is a fixed UTC+05:30 with no DST, so date arithmetic
// uses the fixed offset and formatting uses Intl with the clinic time zone.

export const TZ = "Asia/Kolkata";
const OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A calendar day in IST, represented as days since epoch (IST-local). */
export type IstDay = number;

export function istDayOf(d: Date): IstDay {
  return Math.floor((d.getTime() + OFFSET_MS) / DAY_MS);
}

export function today(now: Date = new Date()): IstDay {
  return istDayOf(now);
}

/** UTC instant for an IST wall-clock time on a given IST day. */
export function istInstant(day: IstDay, hh = 0, mm = 0): Date {
  return new Date(day * DAY_MS - OFFSET_MS + (hh * 60 + mm) * 60_000);
}

/** "2026-10-10" for a SQL date column. */
export function isoDate(day: IstDay): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function dayFromIso(iso: string): IstDay {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function weekday(day: IstDay): number {
  // 1970-01-01 was a Thursday (4).
  return (((day + 4) % 7) + 7) % 7;
}

function parts(d: Date) {
  const local = new Date(d.getTime() + OFFSET_MS);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    wd: local.getUTCDay(),
    hh: local.getUTCHours(),
    mm: local.getUTCMinutes(),
  };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "Thursday, 8 October" */
export function longDay(d: Date | IstDay): string {
  const p = parts(typeof d === "number" ? istInstant(d, 12) : d);
  return `${WEEKDAYS[p.wd]}, ${p.d} ${MONTHS[p.m]}`;
}

/** "Fri 9" */
export function dayLabel(d: Date): string {
  const p = parts(d);
  return `${WEEKDAYS[p.wd].slice(0, 3)} ${p.d}`;
}

/** "16:00" */
export function timeLabel(d: Date): string {
  const p = parts(d);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

/** "4:00 PM" */
export function time12(d: Date): string {
  const p = parts(d);
  const h = p.hh % 12 === 0 ? 12 : p.hh % 12;
  return `${h}:${String(p.mm).padStart(2, "0")} ${p.hh < 12 ? "AM" : "PM"}`;
}

/** "Friday the 9th at 11:30 AM" (or "today at …" / "tomorrow at …") */
export function spoken(d: Date, now: Date = new Date()): string {
  const p = parts(d);
  const diff = istDayOf(d) - today(now);
  const t = time12(d).replace(":00 ", " ");
  if (diff === 0) return `today at ${t}`;
  if (diff === 1) return `tomorrow, ${WEEKDAYS[p.wd]} the ${ordinal(p.d)}, at ${t}`;
  return `${WEEKDAYS[p.wd]} the ${ordinal(p.d)} at ${t}`;
}

/** "Saturday the 10th" */
export function spokenDay(d: Date): string {
  const p = parts(d);
  return `${WEEKDAYS[p.wd]} the ${ordinal(p.d)}`;
}

export function hourOf(d: Date): number {
  return parts(d).hh;
}

export function relativeAgo(d: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}
