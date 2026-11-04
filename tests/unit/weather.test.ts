import { describe, expect, it } from "vitest";
import { OpenMeteoWeatherClient, parseOpenMeteo } from "@/server/integrations/weather/open-meteo";

// Shapes recorded from the Open-Meteo forecast and marine APIs (trimmed to two hours).
const forecast = {
  hourly: {
    time: ["2026-11-04T10:00", "2026-11-04T11:00"],
    wind_speed_10m: [12.4, 18.1],
    wind_gusts_10m: [20.2, null],
    precipitation: [0, 0.4],
    weather_code: [2, 61],
    visibility: [24140, 9000],
  },
};
const marine = { hourly: { time: ["2026-11-04T10:00", "2026-11-04T11:00"], wave_height: [0.42, 0.5] } };

describe("Open-Meteo weather client", () => {
  it("merges forecast and marine series into UTC points", () => {
    const points = parseOpenMeteo(forecast, marine);
    expect(points).toEqual([
      {
        time: new Date("2026-11-04T10:00:00Z"),
        windKmh: 12.4,
        gustKmh: 20.2,
        waveM: 0.42,
        precipMmH: 0,
        weatherCode: 2,
        visibilityM: 24140,
      },
      {
        time: new Date("2026-11-04T11:00:00Z"),
        windKmh: 18.1,
        gustKmh: null,
        waveM: 0.5,
        precipMmH: 0.4,
        weatherCode: 61,
        visibilityM: 9000,
      },
    ]);
  });

  it("leaves waves unknown where there's no marine data (inland water)", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return url.includes("marine")
        ? new Response("{}", { status: 400 })
        : new Response(JSON.stringify(forecast), { status: 200 });
    }) as typeof fetch;
    const result = await new OpenMeteoWeatherClient(fakeFetch).getForecast({
      lat: 6.45,
      lng: 3.39,
      from: new Date("2026-11-04T10:00:00Z"),
      to: new Date("2026-11-04T11:00:00Z"),
    });
    expect(result.source).toBe("open-meteo");
    expect(result.points.map((p) => p.waveM)).toEqual([null, null]);
    expect(calls[0]).toContain("wind_speed_unit=kmh");
    expect(calls[0]).toContain("start_date=2026-11-04");
  });
});
