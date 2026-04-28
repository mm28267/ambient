/**
 * Open-Meteo weather helper.
 *
 * Free, no API key, no auth. We just need lat/lng.
 * https://open-meteo.com/en/docs
 */

export type CurrentWeather = {
  temperatureF: number;
  weatherCode: number;
};

export async function fetchCurrentWeather(
  latitude: number,
  longitude: number
): Promise<CurrentWeather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toFixed(3));
  url.searchParams.set("longitude", longitude.toFixed(3));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("temperature_unit", "fahrenheit");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Open-Meteo failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return {
    temperatureF: data.current?.temperature_2m,
    weatherCode: data.current?.weather_code,
  };
}

/**
 * Map a WMO weather code (https://open-meteo.com/en/docs#weathervariables)
 * to a single emoji + label.
 */
export function weatherCodeToEmoji(code: number | null): { emoji: string; label: string } {
  if (code == null) return { emoji: "", label: "" };
  if (code === 0) return { emoji: "☀️", label: "Clear" };
  if (code === 1 || code === 2) return { emoji: "🌤️", label: "Mostly clear" };
  if (code === 3) return { emoji: "☁️", label: "Cloudy" };
  if (code >= 45 && code <= 48) return { emoji: "🌫️", label: "Foggy" };
  if (code >= 51 && code <= 57) return { emoji: "🌦️", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { emoji: "🌧️", label: "Rain" };
  if (code >= 71 && code <= 77) return { emoji: "❄️", label: "Snow" };
  if (code >= 80 && code <= 82) return { emoji: "🌧️", label: "Showers" };
  if (code >= 85 && code <= 86) return { emoji: "🌨️", label: "Snow showers" };
  if (code >= 95) return { emoji: "⛈️", label: "Thunderstorm" };
  return { emoji: "🌥️", label: "" };
}
