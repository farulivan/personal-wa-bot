export type TimeContext = {
  now: () => Date;
  timezoneOffsetMinutes: number;
  toUserDate: (utcDate: Date) => Date;
  todayUserDateStr: () => string;
};

export function createTimeContext(offsetMinutes: number): TimeContext {
  return {
    now: () => new Date(),
    timezoneOffsetMinutes: offsetMinutes,
    toUserDate: (utcDate) => new Date(utcDate.getTime() + offsetMinutes * 60000),
    todayUserDateStr: () => {
      const d = new Date(Date.now() + offsetMinutes * 60000);
      return d.toISOString().slice(0, 10);
    },
  };
}
