---
name: weather
description: "Get current weather and forecasts via Open-Meteo (free, no API key). Use when: user asks about weather, temperature, or forecasts for any location."
metadata: { "openclaw": { "emoji": "🌤️" } }
---

# Weather Skill

Get current weather conditions using the free Open-Meteo API.

## IMPORTANT — How to fetch weather

**DO NOT use web_search or browser for weather.** Instead, use the `web_fetch` tool to call the Open-Meteo API directly. The API is free, needs no key, and returns structured JSON instantly.

## When to Use

- "What's the weather?"
- "Will it rain today/tomorrow?"
- "Temperature in [city]"
- "Weather forecast for the week"
- Any question about current or upcoming weather conditions

## Steps

### Step 1 — Geocode the location

Use `web_fetch` to resolve the city name to coordinates:

```
https://geocoding-api.open-meteo.com/v1/search?name=Sydney&count=1&language=en&format=json
```

Replace `Sydney` with the requested city. Extract `results[0].latitude` and `results[0].longitude` from the JSON response.

### Step 2 — Fetch weather

Use `web_fetch` with the coordinates from Step 1:

**Current weather only:**

```
https://api.open-meteo.com/v1/forecast?latitude=-33.87&longitude=151.21&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto
```

**With 3-day forecast:**

```
https://api.open-meteo.com/v1/forecast?latitude=-33.87&longitude=151.21&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=3
```

Replace latitude/longitude with the values from Step 1.

## Weather Codes

- 0: Clear sky
- 1-3: Partly cloudy
- 45, 48: Fog
- 51-55: Drizzle
- 61-65: Rain
- 71-75: Snow
- 80-82: Rain showers
- 95: Thunderstorm
- 96, 99: Thunderstorm with hail

## Response Format

Present weather clearly and concisely:

- Temperature (actual + feels-like)
- Condition (decoded from weather code)
- Humidity, wind speed/direction
- For forecasts: daily high/low, precipitation chance

## Notes

- No API key needed (Open-Meteo is free for non-commercial use)
- Always geocode first — don't hardcode coordinates
- Timezone is auto-detected from coordinates
