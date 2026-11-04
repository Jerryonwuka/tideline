import type { Forecast, ForecastPoint, ForecastRequest, WeatherClient } from "./types";

const CALM: Omit<ForecastPoint, "time"> = {
  windKmh: 10,
  gustKmh: 15,
  waveM: 0.3,
  precipMmH: 0,
  weatherCode: 1,
  visibilityM: 10_000,
};

/** Hourly points across the requested window, calm by default; override any field per test. */
export class FakeWeatherClient implements WeatherClient {
  constructor(private conditions: Partial<Omit<ForecastPoint, "time">> = {}) {}

  set(conditions: Partial<Omit<ForecastPoint, "time">>): this {
    this.conditions = conditions;
    return this;
  }

  async getForecast(req: ForecastRequest): Promise<Forecast> {
    const points: ForecastPoint[] = [];
    const hour = 3_600_000;
    const start = Math.floor(req.from.getTime() / hour) * hour;
    for (let t = start; t <= req.to.getTime(); t += hour) {
      points.push({ time: new Date(t), ...CALM, ...this.conditions });
    }
    return { lat: req.lat, lng: req.lng, fetchedAt: new Date(), source: "fake", points };
  }
}
