// Maps an OpenWeatherMap "current weather" response (units=metric) to our snapshot.
import type { WeatherSnapshot } from "./types.ts";

const PRECIPITATION_GROUPS = new Set(["Rain", "Drizzle", "Thunderstorm", "Snow"]);

export class WeatherParseError extends Error {}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function parseWeather(raw: unknown): WeatherSnapshot {
  const obj = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const main = obj.main !== null && typeof obj.main === "object" ? (obj.main as Record<string, unknown>) : {};
  const temp = num(main.temp);
  if (temp === undefined) throw new WeatherParseError("weather response has no temperature");
  const conditions = Array.isArray(obj.weather) ? obj.weather : [];
  const precipitating =
    conditions.some((c) => PRECIPITATION_GROUPS.has((c as { main?: string } | null)?.main ?? "")) ||
    (num((obj.rain as { "1h"?: unknown } | undefined)?.["1h"]) ?? 0) > 0 ||
    (num((obj.snow as { "1h"?: unknown } | undefined)?.["1h"]) ?? 0) > 0;
  return { temp_c: temp, feels_like_c: num(main.feels_like) ?? temp, is_precipitating: precipitating };
}

// US ZIP codes use the zip lookup, anything else is treated as a city name.
export function weatherUrl(location: string, apiKey: string): string {
  const place = location.trim();
  const zip = /^(\d{5})(-\d{4})?$/.exec(place);
  const query = zip ? `zip=${zip[1]},US` : `q=${encodeURIComponent(place)}`;
  return `https://api.openweathermap.org/data/2.5/weather?${query}&units=metric&appid=${encodeURIComponent(apiKey)}`;
}

// Never put the URL (it contains the key) in an error message or a log.
export async function fetchWeather(fetchFn: typeof fetch, apiKey: string, location: string): Promise<WeatherSnapshot> {
  const response = await fetchFn(weatherUrl(location, apiKey));
  if (!response.ok) throw new WeatherParseError(`weather lookup failed (HTTP ${response.status})`);
  return parseWeather(await response.json());
}
