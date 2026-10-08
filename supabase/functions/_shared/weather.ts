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
