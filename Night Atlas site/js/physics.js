// Radiative Transfer, Walker's Law, Aerosol Scattering, Policy Compliance & BACI Engine
export function isCurfewActive(hour, startHour, endHour) {
  if (startHour === endHour) return false;
  if (startHour > endHour) return hour >= startHour || hour < endHour;
  return hour >= startHour && hour < endHour;
}

export function spectralScatteringFactor(cctKelvin) {
  return Math.max(0.55, Math.min(1.25, 0.42 + 0.58 * (cctKelvin / 4000)));
}

export function melatoninSuppressionIndex(cctKelvin) {
  return Math.max(0.32, Math.min(1.2, 0.18 + 0.82 * (cctKelvin / 4000)));
}

export function walkersLawSkyglow(radianceNtl, distanceKm = 1.0, aerosolTau = 0.2) {
  const safeDist = Math.max(0.5, distanceKm);
  const aerosolMultiplier = 1.0 + 0.65 * Math.max(0.02, aerosolTau);
  return (radianceNtl * aerosolMultiplier) / Math.pow(safeDist, 2.5);
}

export function computeScenarioMetrics(city, scenario, localHour, customDim = null, customTau = null) {
  const fixtures = city.fixtures || [];
  const n = fixtures.length;
  const curfewOn = isCurfewActive(localHour, scenario.curfewStartHour, scenario.curfewEndHour);
  const activeDim = customDim !== null ? customDim : curfewOn ? scenario.dimFactor : 1.0;
  const aerosolTau = customTau !== null ? customTau : (city.aerosolTau ?? 0.22);

  const nightHoursYear = 4100;
  const curfewHoursYear = scenario.curfewStartHour !== scenario.curfewEndHour ? 2190 : 0;
  const fullHoursYear = nightHoursYear - curfewHoursYear;

  const totalWattage = fixtures.reduce((acc, f) => acc + (f.wattage || 120), 0);
  const annualKwh =
    (totalWattage * (fullHoursYear * 1.0 + curfewHoursYear * scenario.dimFactor)) / 1000;
  const annualCost = annualKwh * city.tariffPerKwh;
  const totalCapex = n * scenario.capexPerFixture;

  // Per-fixture horizontal illuminance using each fixture's actual pole height (heightM)
  const rOffset = 12; // 12m horizontal evaluation offset
  let luxSum = 0;
  for (const f of fixtures) {
    const h = Math.max(1, f.heightM || 10);
    const lumens = (f.wattage || 120) * (f.efficacyLmW || 130) * activeDim * (1 - scenario.ufr * 0.5);
    const slantDist2 = rOffset * rOffset + h * h;
    const cosTheta = h / Math.sqrt(slantDist2);
    luxSum += (lumens / (2 * Math.PI * slantDist2)) * cosTheta;
  }
  const meanGroundLux = n > 0 ? luxSum / n : 0;

  // Scale modeled upward radiance by fixture count & wattage relative to a 16-fixture x 120W reference grid
  const refTotalWattage = 16 * 120;
  const fixtureFluxScale = n > 0 ? totalWattage / refTotalWattage : 0;
  const rho = 0.14;
  const uplightWeight = (scenario.ufr + rho * (1 - scenario.ufr)) / (0.14 + rho * 0.86);
  const blueFactor = spectralScatteringFactor(scenario.cctKelvin);
  const msi = melatoninSuppressionIndex(scenario.cctKelvin);
  const modeledRadiance =
    city.baselineViirsRadiance * fixtureFluxScale * activeDim * uplightWeight * blueFactor;

  const effectiveSkyFlux = walkersLawSkyglow(modeledRadiance, 1.0, aerosolTau);
  const kCal = 0.25;
  const zenithSkyMag = city.naturalSkyMag - 2.5 * Math.log10(1 + kCal * effectiveSkyFlux);

  return {
    annualKwh,
    annualCost,
    totalCapex,
    meanGroundLux,
    modeledRadiance,
    zenithSkyMag,
    activeDim,
    curfewOn,
    blueFactor,
    msi,
    aerosolTau
  };
}

export function generateHeatmapPoints(city, scenario, localHour, customDim = null, customTau = null) {
  const curfewOn = isCurfewActive(localHour, scenario.curfewStartHour, scenario.curfewEndHour);
  const activeDim = customDim !== null ? customDim : curfewOn ? scenario.dimFactor : 1.0;
  const rOffset = 12;
  const points = [];
  for (const f of city.fixtures) {
    const h = Math.max(1, f.heightM || 10);
    const lumens = (f.wattage || 120) * (f.efficacyLmW || 130) * activeDim * (1 - scenario.ufr * 0.5);
    const slantDist2 = rOffset * rOffset + h * h;
    const cosTheta = h / Math.sqrt(slantDist2);
    const lux = (lumens / (2 * Math.PI * slantDist2)) * cosTheta;
    points.push({
      position: [f.lon, f.lat],
      weight: lux * 1.4
    });
  }
  return points;
}

export function computeBaciStats(tBefore, tAfter, cBefore, cAfter) {
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const variance = (arr, m) =>
    arr.length > 1
      ? arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length - 1)
      : 0;

  const mTB = mean(tBefore);
  const mTA = mean(tAfter);
  const mCB = mean(cBefore);
  const mCA = mean(cAfter);

  const deltaBaci = (mTA - mTB) - (mCA - mCB);
  const se = Math.sqrt(
    variance(tBefore, mTB) / Math.max(1, tBefore.length) +
      variance(tAfter, mTA) / Math.max(1, tAfter.length) +
      variance(cBefore, mCB) / Math.max(1, cBefore.length) +
      variance(cAfter, mCA) / Math.max(1, cAfter.length)
  );
  const tStat = se > 0 ? deltaBaci / se : 0;
  const ciHalf = 1.96 * se;

  return {
    deltaBaci,
    se,
    tStat,
    ciLow: deltaBaci - ciHalf,
    ciHigh: deltaBaci + ciHalf,
    significant: Math.abs(tStat) > 1.96
  };
}

export function computeCalibrationMetrics(pairs) {
  if (!pairs.length) return { r2: null, rmse: null, meanBias: null };
  const obsMean = pairs.reduce((s, p) => s + p.observed, 0) / pairs.length;
  let ssRes = 0;
  let ssTot = 0;
  let biasSum = 0;
  for (const p of pairs) {
    ssRes += Math.pow(p.observed - p.modeled, 2);
    ssTot += Math.pow(p.observed - obsMean, 2);
    biasSum += p.modeled - p.observed;
  }
  const rmse = Math.sqrt(ssRes / pairs.length);
  const meanBias = biasSum / pairs.length;
  // R^2 is undefined when observed values have zero variance (ssTot === 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
  return { r2, rmse, meanBias };
}

export function auditMunicipalInventory(fixtures) {
  return fixtures
    .map((f) => {
      const nonCompliantUfr = f.ufr > 0.01;
      const nonCompliantCct = f.cct > 3000;
      const capex = nonCompliantUfr || nonCompliantCct ? 280 : 65;
      const annualKwhSaved = (f.wattage * 2190 * 0.45) / 1000;
      const skyglowReduction =
        (f.ufr - 0.01) * 100 + (spectralScatteringFactor(f.cct) - spectralScatteringFactor(2700)) * 25;
      const priorityScore = (skyglowReduction + annualKwhSaved * 0.25) / Math.max(1, capex);
      return {
        ...f,
        compliant: !nonCompliantUfr && !nonCompliantCct,
        capex,
        annualKwhSaved,
        priorityScore
      };
    })
    .sort((a, b) => {
      if (a.compliant !== b.compliant) return a.compliant ? 1 : -1;
      return b.priorityScore - a.priorityScore;
    });
}

export function summarizeGeoJson(geojson) {
  const features = geojson?.features || [];
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;
  for (const feat of features) {
    const geom = feat.geometry;
    if (!geom) continue;
    const coords =
      geom.type === "Point"
        ? [geom.coordinates]
        : geom.type === "Polygon"
          ? geom.coordinates[0]
          : geom.type === "MultiPolygon"
            ? geom.coordinates[0][0]
            : [];
    for (const pt of coords) {
      if (Array.isArray(pt) && pt.length >= 2) {
        sumLon += pt[0];
        sumLat += pt[1];
        count++;
      }
    }
  }
  return {
    featureCount: features.length,
    centroid: count > 0 ? [sumLon / count, sumLat / count] : null
  };
}

export function evaluatePolicyCompliance(scenario, metrics) {
  const checks = [
    { label: "UFR ≤ 1%", pass: scenario.ufr <= 0.01 },
    { label: "CCT ≤ 3000K", pass: scenario.cctKelvin <= 3000 },
    { label: "Curfew Active", pass: scenario.curfewStartHour !== scenario.curfewEndHour },
    { label: "Safety ≥ 5 lx", pass: metrics.meanGroundLux >= 5.0 }
  ];
  const score = checks.filter((c) => c.pass).length;
  return { checks, score, total: checks.length };
}

export function computeSensitivitySweep(city, baseScenario, localHour, customTau = null) {
  const ufrSteps = [0.0, 0.02, 0.05, 0.1, 0.14, 0.2];
  const ccts = [2700, 3000, 4000];
  return ccts.map((cct) => ({
    cct,
    points: ufrSteps.map((ufr) => {
      const m = computeScenarioMetrics(
        city,
        { ...baseScenario, ufr, cctKelvin: cct },
        localHour,
        null,
        customTau
      );
      return { ufrPct: ufr * 100, zenithSkyMag: m.zenithSkyMag };
    })
  }));
}

export function formatNumber(val, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(val);
}
