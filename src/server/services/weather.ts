import "server-only";
import type { WeatherInput, WeatherPoint } from "@/lib/safety/engine";
import type { Json } from "@/lib/database.types";
import type { Forecast, WeatherClient } from "@/server/integrations/weather/types";
import type { AdminDb } from "@/server/supabase/admin";

// Forecasts are cached per location (lat/lng rounded to ~1 km) in weather_cache, filled every 30
// minutes by the weather-poll job for jetties on active routes, and on demand when a check finds
// nothing fresh. Only the server writes the cache.

/** Refetch on demand when the cached forecast is older than this. */
const REFRESH_AFTER_MS = 60 * 60_000;
/** How far ahead the poll job fetches. */
const POLL_HOURS = 36;

export interface Place {
  lat: number;
  lng: number;
}

export const cacheKey = (p: Place) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
export const midpoint = (a: Place, b: Place): Place => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });

function toPoints(forecast: Forecast): WeatherPoint[] {
  return forecast.points.map((p) => ({ ...p, time: p.time.toISOString() }));
}

async function store(db: AdminDb, place: Place, forecast: Forecast) {
  const points = toPoints(forecast);
  const { error } = await db.from("weather_cache").upsert({
    key: cacheKey(place),
    lat: place.lat,
    lng: place.lng,
    fetched_at: forecast.fetchedAt.toISOString(),
    valid_from: points[0]?.time ?? forecast.fetchedAt.toISOString(),
    valid_to: points[points.length - 1]?.time ?? forecast.fetchedAt.toISOString(),
    source: forecast.source,
    data: points as unknown as NonNullable<Json>,
  });
  if (error) throw new Error(`weather_cache: ${error.code}`);
  return { fetchedAt: forecast.fetchedAt.toISOString(), points };
}

/**
 * Weather for a trip window at the given places (origin and midpoint). Uses the cache when fresh
 * and covering the window, else fetches. If fetching fails, the last cached copy is used (the rules
 * treat anything older than 3 hours as unknown); null when there's nothing at all.
 */
export async function weatherFor(
  db: AdminDb,
  client: WeatherClient,
  places: Place[],
  from: Date,
  to: Date,
  now: Date,
): Promise<WeatherInput | null> {
  const { data: cached } = await db
    .from("weather_cache")
    .select("key, fetched_at, valid_to, data")
    .in("key", places.map(cacheKey));
  const byKey = new Map((cached ?? []).map((c) => [c.key, c]));
  const parts: { fetchedAt: string; points: WeatherPoint[] }[] = [];
  for (const place of places) {
    const hit = byKey.get(cacheKey(place));
    const fresh =
      hit && now.getTime() - Date.parse(hit.fetched_at) < REFRESH_AFTER_MS && Date.parse(hit.valid_to) >= to.getTime();
    if (fresh) {
      parts.push({ fetchedAt: hit.fetched_at, points: hit.data as unknown as WeatherPoint[] });
      continue;
    }
    try {
      const start = new Date(Math.min(from.getTime(), now.getTime()));
      parts.push(await store(db, place, await client.getForecast({ ...place, from: start, to })));
    } catch {
      if (hit) parts.push({ fetchedAt: hit.fetched_at, points: hit.data as unknown as WeatherPoint[] });
    }
  }
  if (!parts.length) return null;
  // The oldest part decides how fresh the whole picture is.
  const fetchedAt = parts.map((p) => p.fetchedAt).sort()[0]!;
  return { fetchedAt, points: parts.flatMap((p) => p.points) };
}

/** weather-poll job: refresh forecasts for jetties (and midpoints) of active routes. */
export async function pollWeather(db: AdminDb, client: WeatherClient, now: Date) {
  const { data, error } = await db
    .from("routes")
    .select(
      "origin:jetties!routes_origin_jetty_id_jetties_id_fk(lat, lng), destination:jetties!routes_destination_jetty_id_jetties_id_fk(lat, lng)",
    )
    .eq("active", true);
  if (error) throw new Error(`routes: ${error.code}`);
  const places = new Map<string, Place>();
  for (const r of data) {
    if (!r.origin || !r.destination) continue;
    for (const p of [r.origin, midpoint(r.origin, r.destination)]) places.set(cacheKey(p), p);
  }
  const to = new Date(now.getTime() + POLL_HOURS * 60 * 60_000);
  let fetched = 0;
  let failed = 0;
  for (const place of places.values()) {
    try {
      await store(db, place, await client.getForecast({ ...place, from: now, to }));
      fetched += 1;
    } catch {
      failed += 1;
    }
  }
  return { places: places.size, fetched, failed };
}
