import type { Forecast, ForecastPoint, ForecastRequest, WeatherClient } from "./types";

// Open-Meteo (https://open-meteo.com): forecast API for wind, gusts, rain, weather code and
// visibility, marine API for wave height. Free, no key. Times are requested in UTC.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

interface Hourly {
  time: string[];
  [series: string]: (number | null)[] | string[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Merges Open-Meteo hourly series (forecast + marine) into forecast points. */
export function parseOpenMeteo(forecast: { hourly: Hourly }, marine: { hourly: Hourly } | null): ForecastPoint[] {
  const waves = new Map<string, number | null>();
  if (marine) {
    marine.hourly.time.forEach((t, i) => waves.set(t, (marine.hourly.wave_height as (number | null)[])?.[i] ?? null));
  }
  const h = forecast.hourly;
  const series = (name: string, i: number) =>
    ((h[name] as (number | null)[] | undefined)?.[i] ?? null) as number | null;
  return h.time.map((t, i) => ({
    time: new Date(`${t}:00Z`),
    windKmh: series("wind_speed_10m", i),
    gustKmh: series("wind_gusts_10m", i),
    waveM: waves.get(t) ?? null,
    precipMmH: series("precipitation", i),
    weatherCode: series("weather_code", i),
    visibilityM: series("visibility", i),
  }));
}

export class OpenMeteoWeatherClient implements WeatherClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getForecast(req: ForecastRequest): Promise<Forecast> {
    const common = `latitude=${req.lat}&longitude=${req.lng}&timezone=GMT&start_date=${day(req.from)}&end_date=${day(req.to)}`;
    const [forecastRes, marineRes] = await Promise.all([
      this.fetchImpl(
        `${FORECAST_URL}?${common}&hourly=wind_speed_10m,wind_gusts_10m,precipitation,weather_code,visibility&wind_speed_unit=kmh`,
      ),
      this.fetchImpl(`${MARINE_URL}?${common}&hourly=wave_height`),
    ]);
    if (!forecastRes.ok) throw new Error(`open-meteo forecast ${forecastRes.status}`);
    // No marine data for inland water (lagoons, rivers): waves stay unknown.
    const marine = marineRes.ok ? ((await marineRes.json()) as { hourly: Hourly }) : null;
    const points = parseOpenMeteo((await forecastRes.json()) as { hourly: Hourly }, marine);
    return { lat: req.lat, lng: req.lng, fetchedAt: new Date(), source: "open-meteo", points };
  }
}
