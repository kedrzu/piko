/**
 * How many midnights lie from one time to another in the computer's time zone, negative when `to` is earlier: 1 from
 * 23:59 to 00:01 the next day, 0 within a day. A daylight-saving change does not count as a day.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function calendarDaysBetween(from: Date, to: Date): number {
    const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((end - start) / 86_400_000);
}
