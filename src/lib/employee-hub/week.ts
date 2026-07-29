/** Monday-start week containing `date` (YYYY-MM-DD). */
export function weekBounds(date: string): { start: string; end: string } {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  const start = dt.toISOString().slice(0, 10);
  const endDt = new Date(dt);
  endDt.setUTCDate(endDt.getUTCDate() + 6);
  return { start, end: endDt.toISOString().slice(0, 10) };
}

export function weekDays(start: string): string[] {
  const [y, m, d] = start.split("-").map(Number);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    days.push(dt.toISOString().slice(0, 10));
  }
  return days;
}

export function formatWeekday(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00.000Z`));
}
