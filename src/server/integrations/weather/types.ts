export interface ForecastRequest {
  lat: number;
  lng: number;
  /** UTC window to cover, e.g. departure → estimated arrival. */
  from: Date;
  to: Date;
}

/** One hourly forecast point. Null where the provider has no value (e.g. no marine data inland). */
export interface ForecastPoint {
  time: Date;
  windKmh: number | null;
  gustKmh: number | null;
  waveM: number | null;
  precipMmH: number | null;
  /** WMO weather interpretation code. */
  weatherCode: number | null;
  visibilityM: number | null;
}

export interface Forecast {
  lat: number;
  lng: number;
  fetchedAt: Date;
  source: string;
  points: ForecastPoint[];
}

export interface WeatherClient {
  getForecast(req: ForecastRequest): Promise<Forecast>;
}
