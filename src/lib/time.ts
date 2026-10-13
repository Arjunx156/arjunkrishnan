const formatters = new Map<string, Intl.DateTimeFormat>();

// "21:04" in the given zone, 24-hour.
export function clock(date: Date, timeZone: string): string {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
    formatters.set(timeZone, f);
  }
  return f.format(date);
}
