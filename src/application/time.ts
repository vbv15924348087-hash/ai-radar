/** Convert the configured calendar day's midnight to UTC, including timezone offsets. */
export function startOfDay(date: string, timeZone = process.env.RADAR_TIMEZONE || "Asia/Shanghai"): string {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const parts = (date: Date) => Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  const midnight = Date.parse(`${date}T00:00:00.000Z`);
  let utc = midnight;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(utc));
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    utc += midnight - represented;
  }
  return new Date(utc).toISOString();
}
export function startOfToday(now = new Date(), timeZone = process.env.RADAR_TIMEZONE || "Asia/Shanghai") {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(part => [part.type, part.value]));
  return startOfDay(`${parts.year}-${parts.month}-${parts.day}`, timeZone);
}
export function endOfDay(date: string, timeZone = process.env.RADAR_TIMEZONE || "Asia/Shanghai") {
  const nextDate = new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  return new Date(Date.parse(startOfDay(nextDate, timeZone)) - 1).toISOString();
}
