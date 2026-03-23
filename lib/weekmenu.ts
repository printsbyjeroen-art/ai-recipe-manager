export function getWeekStartISO(date = new Date()) {
  const d = new Date(date);
  // Convert JS day (0=Sun..6=Sat) into (0=Mon..6=Sun)
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export const WEEKMENU_SLOT = "dinner" as const;
export type WeekmenuSlot = typeof WEEKMENU_SLOT;

export const WEEK_DAYS = [
  { idx: 0, label: "Monday" },
  { idx: 1, label: "Tuesday" },
  { idx: 2, label: "Wednesday" },
  { idx: 3, label: "Thursday" },
  { idx: 4, label: "Friday" },
  { idx: 5, label: "Saturday" },
  { idx: 6, label: "Sunday" }
] as const;

