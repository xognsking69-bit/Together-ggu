// Calendar dates are device-local. Sync/audit timestamps still use ISO UTC.
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month-1, day, 12);
  return localDateKey(date) === value ? date : null;
}

export function calendarDayDiff(from: Date, to: Date): number {
  // Compare calendar components, not 23/25-hour DST days.
  return Math.round((Date.UTC(to.getFullYear(),to.getMonth(),to.getDate()) -
    Date.UTC(from.getFullYear(),from.getMonth(),from.getDate())) / 86400000);
}
