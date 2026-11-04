// Sunrise and sunset (NOAA's simplified solar equations; within a couple of minutes between the
// polar circles). Used for the night rule at the jetty, on the server and offline on the phone.

const RAD = Math.PI / 180;
const J2000 = 2451545;
const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;

const toJulian = (ms: number) => ms / DAY_MS + UNIX_EPOCH_JD;
const fromJulian = (jd: number) => new Date((jd - UNIX_EPOCH_JD) * DAY_MS);

/**
 * Sunrise and sunset (UTC instants) for a local calendar date ("YYYY-MM-DD") at a place.
 * Null when the sun doesn't rise or set that day.
 */
export function sunTimes(date: string, lat: number, lng: number): { sunrise: Date; sunset: Date } | null {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  // Local solar noon of that date, as a Julian day count from J2000.
  const n = Math.round(toJulian(Date.UTC(y, m - 1, d, 12)) - J2000 - lng / 360);
  const jStar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = J2000 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDecl = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDecl = Math.cos(Math.asin(sinDecl));
  const cosOmega = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDecl) / (Math.cos(lat * RAD) * cosDecl);
  if (cosOmega < -1 || cosOmega > 1) return null;
  const omega = Math.acos(cosOmega) / RAD;
  return { sunrise: fromJulian(transit - omega / 360), sunset: fromJulian(transit + omega / 360) };
}
