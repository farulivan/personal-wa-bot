export function toUserDate(utcDate: Date, timezoneOffsetMinutes: number): string {
  const local = new Date(utcDate.getTime() + timezoneOffsetMinutes * 60000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthDateRange(
  now: Date,
  timezoneOffsetMinutes: number
): { startDateInclusive: string; endDateInclusive: string } {
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startDateInclusive: `${year}-${String(month).padStart(2, '0')}-01`,
    endDateInclusive: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}
