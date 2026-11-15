// International Dark-Sky & Urban Skyglow Benchmark Presets
export const CITY_PRESETS = {
  geneva: {
    id: "geneva",
    name: "Geneva · Central Municipal Corridor",
    country: "Switzerland",
    center: [6.1432, 46.2044],
    zoom: 13.6,
    pitch: 40,
    bearing: 0,
    timezone: "Europe/Zurich",
    tariffPerKwh: 0.29,
    currency: "USD",
    baselineViirsRadiance: 26.8,
    naturalSkyMag: 21.92,
    aerosolTau: 0.16,
    description:
      "Central Geneva urban-lakeshore corridor; toggle the lighting simulation grid or load a QGIS GeoJSON layer to inspect fixtures.",
    fixtures: generateGridFixtures([6.1432, 46.2044], 16, 3000, 110, 10)
  },
  moscow_presnensky: {
    id: "moscow_presnensky",
    name: "Moscow · Presnensky / Moscow-City (58 nW)",
    country: "Russia",
    center: [37.5371, 55.7495],
    zoom: 14.0,
    pitch: 44,
    bearing: -12,
    timezone: "Europe/Moscow",
    tariffPerKwh: 0.085,
    currency: "USD",
    baselineViirsRadiance: 58.0,
    naturalSkyMag: 21.95,
    aerosolTau: 0.28,
    description:
      "Business center (Vilpan, 2026): mean 58 nW·cm⁻²·sr⁻¹, peak >150 nW (Class 4 Extreme) from high-rise glass facades and media screens.",
    fixtures: generateGridFixtures([37.5371, 55.7495], 16, 4000, 150, 12)
  },
  moscow_arbat: {
    id: "moscow_arbat",
    name: "Moscow · Arbat Historic Center (42 nW)",
    country: "Russia",
    center: [37.5905, 55.7498],
    zoom: 14.2,
    pitch: 40,
    bearing: 0,
    timezone: "Europe/Moscow",
    tariffPerKwh: 0.085,
    currency: "USD",
    baselineViirsRadiance: 42.0,
    naturalSkyMag: 21.95,
    aerosolTau: 0.28,
    description:
      "Historic core (Vilpan, 2026): mean 42 nW·cm⁻²·sr⁻¹ (near-continuous Class 4 >50 nW coverage on streets, darker interior courtyards).",
    fixtures: generateGridFixtures([37.5905, 55.7498], 16, 3500, 130, 10)
  },
  moscow_yuzhny: {
    id: "moscow_yuzhny",
    name: "Moscow · Yuzhny Port Industrial (25 nW)",
    country: "Russia",
    center: [37.688, 55.706],
    zoom: 13.8,
    pitch: 38,
    bearing: 10,
    timezone: "Europe/Moscow",
    tariffPerKwh: 0.085,
    currency: "USD",
    baselineViirsRadiance: 25.0,
    naturalSkyMag: 21.95,
    aerosolTau: 0.3,
    description:
      "Industrial/logistics zone (Vilpan, 2026): mean 25 nW·cm⁻²·sr⁻¹, sharp Class 4 floodlight hotspots surrounded by Class 1–2 dark zones.",
    fixtures: generateGridFixtures([37.688, 55.706], 14, 4000, 180, 14)
  },
  moscow_cheremushki: {
    id: "moscow_cheremushki",
    name: "Moscow · Novye Cheryomushki Residential (18 nW)",
    country: "Russia",
    center: [37.558, 55.669],
    zoom: 14.0,
    pitch: 40,
    bearing: -8,
    timezone: "Europe/Moscow",
    tariffPerKwh: 0.085,
    currency: "USD",
    baselineViirsRadiance: 18.0,
    naturalSkyMag: 21.95,
    aerosolTau: 0.26,
    description:
      "Residential district (Vilpan, 2026): mean 18 nW·cm⁻²·sr⁻¹; Class 4 arterials vs. Class 2–3 courtyards — prime target for curfew dimming.",
    fixtures: generateGridFixtures([37.558, 55.669], 16, 3500, 120, 10)
  },
  moscow_losiny: {
    id: "moscow_losiny",
    name: "Moscow · Losiny Ostrov National Park (8 nW)",
    country: "Russia",
    center: [37.765, 55.862],
    zoom: 13.0,
    pitch: 35,
    bearing: 0,
    timezone: "Europe/Moscow",
    tariffPerKwh: 0.085,
    currency: "USD",
    baselineViirsRadiance: 8.0,
    naturalSkyMag: 21.95,
    aerosolTau: 0.22,
    description:
      "Protected urban forest (Vilpan, 2026): mean 8 nW·cm⁻²·sr⁻¹ (Class 2); Class 3 perimeter light-aura decaying to 3–4 nW (Class 1) interior.",
    fixtures: generateGridFixtures([37.765, 55.862], 8, 2700, 80, 8)
  },
  flagstaff: {
    id: "flagstaff",
    name: "Flagstaff · Lowell Observatory Dark-Sky Buffer",
    country: "United States",
    center: [-111.664, 35.202],
    zoom: 14.0,
    pitch: 38,
    bearing: 8,
    timezone: "America/Phoenix",
    tariffPerKwh: 0.14,
    currency: "USD",
    baselineViirsRadiance: 12.6,
    naturalSkyMag: 21.98,
    aerosolTau: 0.08,
    description:
      "International Dark-Sky City reference zone enforcing narrow-spectrum amber/2700K limits near Lowell Observatory.",
    fixtures: generateGridFixtures([-111.664, 35.202], 12, 2700, 85, 10)
  },
  paranal: {
    id: "paranal",
    name: "Antofagasta · Paranal Observatory Buffer Zone",
    country: "Chile",
    center: [-70.404, -24.627],
    zoom: 13.4,
    pitch: 35,
    bearing: 0,
    timezone: "America/Santiago",
    tariffPerKwh: 0.16,
    currency: "USD",
    baselineViirsRadiance: 3.8,
    naturalSkyMag: 22.0,
    aerosolTau: 0.05,
    description:
      "Ultra-sensitive astronomical protection corridor governed by Chilean D.S. N°43/2012 spectral and uplight caps.",
    fixtures: generateGridFixtures([-70.404, -24.627], 10, 3000, 95, 10)
  },
  lavaux: {
    id: "lavaux",
    name: "Lavaux · Lake Geneva Ecological Corridor",
    country: "Switzerland",
    center: [6.764, 46.484],
    zoom: 13.9,
    pitch: 44,
    bearing: 18,
    timezone: "Europe/Zurich",
    tariffPerKwh: 0.29,
    currency: "USD",
    baselineViirsRadiance: 21.4,
    naturalSkyMag: 21.92,
    aerosolTau: 0.16,
    description:
      "Steep terraced vineyard and shoreline corridor sensitive to upward flux reflection and nocturnal ecological fragmentation.",
    fixtures: generateGridFixtures([6.764, 46.484], 14, 3000, 110, 10)
  },
  melbourne: {
    id: "melbourne",
    name: "Melbourne · Yarra River Ecological Buffer",
    country: "Australia",
    center: [144.996, -37.826],
    zoom: 13.8,
    pitch: 40,
    bearing: -18,
    timezone: "Australia/Melbourne",
    tariffPerKwh: 0.22,
    currency: "USD",
    baselineViirsRadiance: 36.9,
    naturalSkyMag: 21.9,
    aerosolTau: 0.22,
    description:
      "Riparian urban corridor balancing pedestrian illuminance safety targets with nocturnal wildlife skyglow mitigation.",
    fixtures: generateGridFixtures([144.996, -37.826], 16, 4000, 130, 11)
  }
};

export const SCENARIOS = {
  baseline: {
    id: "baseline",
    name: "Baseline Reference",
    tag: "Unmitigated 4000K",
    dimFactor: 1.0,
    curfewStartHour: 0,
    curfewEndHour: 0,
    ufr: 0.14,
    cctKelvin: 4000,
    capexPerFixture: 0
  },
  curfew: {
    id: "curfew",
    name: "Midnight Adaptive Dimming",
    tag: "50% Dimming 23:00–05:00",
    dimFactor: 0.5,
    curfewStartHour: 23,
    curfewEndHour: 5,
    ufr: 0.14,
    cctKelvin: 4000,
    capexPerFixture: 65
  },
  shield_warm: {
    id: "shield_warm",
    name: "Full-Cutoff + 2700K Retrofit",
    tag: "UFR 0.01 · 2700K + Curfew",
    dimFactor: 0.55,
    curfewStartHour: 23,
    curfewEndHour: 5,
    ufr: 0.01,
    cctKelvin: 2700,
    capexPerFixture: 280
  }
};

export function generateGridFixtures(center, count, cct, wattage, heightM) {
  const [lon0, lat0] = center;
  const fixtures = [];
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const dLon = (c - (cols - 1) / 2) * 0.0022;
    const dLat = (r - (cols - 1) / 2) * 0.0014;
    fixtures.push({
      id: `FX-${String(i + 1).padStart(2, "0")}`,
      lon: Number((lon0 + dLon).toFixed(6)),
      lat: Number((lat0 + dLat).toFixed(6)),
      wattage,
      efficacyLmW: 130,
      heightM,
      cct,
      ufr: 0.14
    });
  }
  return fixtures;
}
