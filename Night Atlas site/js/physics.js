// Retrofit scenarios override fixture spectra; baseline and dimming retain inventory specs.
export function effectiveFixture(fixture, scenario) {
  return {
    ...fixture,
    cct: scenario.id === "shield_warm" || scenario.spectralOverride ? scenario.cctKelvin : (fixture.cct ?? scenario.cctKelvin),
    ufr: scenario.id === "shield_warm" || scenario.spectralOverride ? scenario.ufr : (fixture.ufr ?? scenario.ufr)
  };
}

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

export function computeSkyViewFactor(buildingHeightM = 0, canyonHalfWidthM = 15) {
  const h = Math.max(0, Number(buildingHeightM) || 0);
  const w = Math.max(2, Number(canyonHalfWidthM) || 15);
  if (h === 0) return 1.0;
  const svf = 1 - h / Math.sqrt(h * h + w * w);
  return Math.max(0.25, Math.min(1.0, svf));
}

export function computeLightSpreadRadiusM(heightM = 10, ufr = 0.14) {
  const h = Math.max(1, Number(heightM) || 10);
  const clampedUfr = Math.max(0, Math.min(1, Number(ufr) || 0));
  const tanMax = 1.88 + Math.min(1, clampedUfr / 0.2) * 1.85;
  return Math.max(4, Math.min(120, h * tanMax));
}

export function raySegmentIntersect(dx, dy, ax, ay, bx, by) {
  const sx = bx - ax;
  const sy = by - ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = (ax * sy - ay * sx) / denom;
  const u = (ax * dy - ay * dx) / denom;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

export function computeRayPolygonVisibility(
  originLonLat,
  maxRadiusM,
  buildings = [],
  numRays = 48,
  poleHeightM = 10
) {
  const [lon0, lat0] = originLonLat;
  const mPerLat = 111320;
  const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);

  const segments = [];
  for (const b of buildings) {
    if ((b.heightM ?? 10) < poleHeightM * 0.5) continue;
    const ring = b.ring;
    if (!Array.isArray(ring) || ring.length < 3) continue;
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i][0] - lon0) * mPerLon;
      const ay = (ring[i][1] - lat0) * mPerLat;
      const bx = (ring[i + 1][0] - lon0) * mPerLon;
      const by = (ring[i + 1][1] - lat0) * mPerLat;
      if (distanceToSegmentM(ax, ay, bx, by) <= maxRadiusM * 1.5) {
        segments.push([ax, ay, bx, by]);
      }
    }
  }

  const pts = [];
  for (let i = 0; i < numRays; i++) {
    const angle = (i / numRays) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let bestT = maxRadiusM;
    for (const [ax, ay, bx, by] of segments) {
      const t = raySegmentIntersect(dx, dy, ax, ay, bx, by);
      if (t !== null && t < bestT) bestT = t;
    }
    const clampedT = Math.max(1.5, bestT);
    pts.push([lon0 + (dx * clampedT) / mPerLon, lat0 + (dy * clampedT) / mPerLat]);
  }
  if (pts.length) pts.push(pts[0]);
  return pts;
}

export function computePhotometricExponent(ufr = 0.14) {
  const clamped = Math.max(0, Math.min(0.3, Number(ufr) || 0));
  return Math.max(0.8, 2.0 - 4.0 * clamped);
}

export function computeGroundIlluminanceAt(
  rM,
  heightM = 10,
  wattage = 120,
  efficacyLmW = 130,
  activeDim = 1.0,
  ufr = 0.14
) {
  const h = Math.max(1, Number(heightM) || 10);
  const r = Math.max(0, Number(rM) || 0);
  const clampedUfr = Math.max(0, Math.min(0.95, Number(ufr) || 0));
  const phiDown = Math.max(0, Number(wattage) || 120) * (Number(efficacyLmW) || 130) * activeDim * (1 - clampedUfr);
  const m = computePhotometricExponent(clampedUfr);
  const slantDist2 = r * r + h * h;
  const cosTheta = h / Math.sqrt(slantDist2);
  return (((m + 1) * phiDown) / (2 * Math.PI * slantDist2)) * Math.pow(cosTheta, m + 1);
}

export function traceFixture3D(
  fixture,
  buildings = [],
  activeDim = 1.0,
  albedoGround = 0.14,
  albedoWall = 0.25
) {
  const lon0 = fixture.lon;
  const lat0 = fixture.lat;
  const h = Math.max(1, Number(fixture.heightM) || 10);
  const ufr = Math.max(0, Math.min(0.95, Number(fixture.ufr ?? 0.14)));
  const wattage = Number(fixture.wattage) || 120;
  const efficacy = Number(fixture.efficacyLmW) || 130;
  const spreadM = computeLightSpreadRadiusM(h, ufr);

  const mPerLat = 111320;
  const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const searchRadiusM = Math.max(spreadM * 1.6, 85);

  const segments = [];
  for (const b of buildings) {
    const bH = Math.max(0, Number(b.heightM ?? 10));
    if (bH <= 0.5) continue;
    const ring = b.ring;
    if (!Array.isArray(ring) || ring.length < 3) continue;
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i][0] - lon0) * mPerLon;
      const ay = (ring[i][1] - lat0) * mPerLat;
      const bx = (ring[i + 1][0] - lon0) * mPerLon;
      const by = (ring[i + 1][1] - lat0) * mPerLat;
      if (distanceToSegmentM(ax, ay, bx, by) <= searchRadiusM) {
        segments.push([ax, ay, bx, by, bH]);
      }
    }
  }

  // 1. 48-ray 3D perimeter & facade-hit tracing
  const numPerim = 48;
  const perimeter = [];
  const rayHits = [];
  let wallHitsPerim = 0;
  for (let i = 0; i < numPerim; i++) {
    const angle = (i / numPerim) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let bestT = spreadM;
    let bestZ = 0.25;
    let hitWall = false;
    for (const [ax, ay, bx, by, bH] of segments) {
      const t = raySegmentIntersect(dx, dy, ax, ay, bx, by);
      if (t !== null && t < bestT) {
        const zAtWall = h * (1 - t / spreadM);
        if (zAtWall <= bH) {
          bestT = t;
          bestZ = Math.max(0.25, zAtWall);
          hitWall = true;
        }
      }
    }
    if (hitWall) wallHitsPerim++;
    const clampedT = Math.max(1.5, bestT);
    const lon = lon0 + (dx * clampedT) / mPerLon;
    const lat = lat0 + (dy * clampedT) / mPerLat;
    perimeter.push([lon, lat]);
    rayHits.push({ lon, lat, z: hitWall ? bestZ : 0.25, hitWall });
  }
  if (perimeter.length) perimeter.push(perimeter[0]);

  // Ground cells have geographic coordinates and lux values, never pixel radii.
  const nAz = 96, nRings = 32;
  const groundSamples = [];
  const groundCells = [];
  let weightedLuxSum = 0, areaWeightSum = 0, peakGroundLux = 0, shadowedCount = 0;
  const totalSamples = nAz * nRings;
  const position = (radius, angle) => [lon0 + Math.cos(angle) * radius / mPerLon, lat0 + Math.sin(angle) * radius / mPerLat, 0.05];
  const blocked = (radius, angle) => {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    return segments.some(([ax, ay, bx, by, bH]) => {
      const t = raySegmentIntersect(dx, dy, ax, ay, bx, by);
      return t !== null && t < radius && h * (1 - t / radius) <= bH;
    });
  };
  for (let ai = 0; ai < nAz; ai++) {
    const a0 = ai * 2 * Math.PI / nAz, a1 = (ai + 1) * 2 * Math.PI / nAz;
    const angle = (a0 + a1) / 2;
    for (let ri = 0; ri < nRings; ri++) {
      const r0 = spreadM * ri / nRings, r1 = spreadM * (ri + 1) / nRings;
      const radius = (r0 + r1) / 2;
      // Conservative cell coverage prevents interpolation from smearing through walls.
      const occluded = blocked(radius, angle) || blocked(r1, a0) || blocked(r1, a1);
      const lux = occluded ? 0 : computeGroundIlluminanceAt(radius, h, wattage, efficacy, activeDim, ufr);
      const area = (r1 * r1 - r0 * r0) / 2;
      weightedLuxSum += lux * area;
      areaWeightSum += area;
      peakGroundLux = Math.max(peakGroundLux, lux);
      if (occluded) shadowedCount++;
      if (lux > 0) {
        const polygon = ri === 0
          ? [position(0, 0), position(r1, a0), position(r1, a1)]
          : [position(r0, a0), position(r1, a0), position(r1, a1), position(r0, a1)];
        groundCells.push({ polygon, lux });
        groundSamples.push({ position: position(radius, angle), weight: lux });
      }
    }
  }

  const wallInterceptFraction = wallHitsPerim / numPerim;
  const shadowedFraction = shadowedCount / totalSamples;
  const directMeanLux = areaWeightSum > 0 ? weightedLuxSum / areaWeightSum : 0;
  const wallBounceLux = directMeanLux * wallInterceptFraction * albedoWall * 0.35;
  const meanGroundLux = directMeanLux + wallBounceLux;

  // 3. 3D upper-hemisphere escape tracing (16 azimuths x 3 elevations = 48 rays)
  const elevDegs = [15, 40, 70];
  let directEscWeight = 0;
  let groundEscWeight = 0;
  let totalHemWeight = 0;
  const nUpAz = 16;

  for (let ai = 0; ai < nUpAz; ai++) {
    const angle = (ai / nUpAz) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (const deg of elevDegs) {
      const rad = (deg * Math.PI) / 180;
      const tanA = Math.tan(rad);
      const wEl = Math.cos(rad);
      totalHemWeight += wEl;

      let blockedFromPole = false;
      let blockedFromGround = false;
      for (const [ax, ay, bx, by, bH] of segments) {
        const t = raySegmentIntersect(dx, dy, ax, ay, bx, by);
        if (t !== null && t > 0.5) {
          if (h + t * tanA <= bH) blockedFromPole = true;
          if (0.5 + t * tanA <= bH) blockedFromGround = true;
          if (blockedFromPole && blockedFromGround) break;
        }
      }
      if (!blockedFromPole) directEscWeight += wEl;
      if (!blockedFromGround) groundEscWeight += wEl;
    }
  }

  const directEscapeFactor = totalHemWeight > 0 ? Math.max(0.15, directEscWeight / totalHemWeight) : 1.0;
  const groundEscapeFactor = totalHemWeight > 0 ? Math.max(0.15, groundEscWeight / totalHemWeight) : 1.0;
  const effectiveCanopyEscape =
    (ufr * directEscapeFactor +
      (1 - ufr) * (1 - wallInterceptFraction) * albedoGround * groundEscapeFactor +
      (1 - ufr) * wallInterceptFraction * albedoWall * 0.5 * directEscapeFactor) /
    Math.max(1e-6, ufr + (1 - ufr) * albedoGround);

  return {
    perimeter,
    rayHits,
    groundSamples,
    groundCells,
    meanGroundLux,
    peakGroundLux,
    shadowedFraction,
    wallInterceptFraction,
    directEscapeFactor,
    groundEscapeFactor,
    effectiveCanopyEscape,
    dimUsed: activeDim
  };
}

export function computeScenarioMetrics(city, scenario, localHour, customDim = null, customTau = null) {
  const fixtures = (city.fixtures || []).map((f) => effectiveFixture(f, scenario));
  const n = fixtures.length;
  const curfewOn = isCurfewActive(localHour, scenario.curfewStartHour, scenario.curfewEndHour);
  const activeDim = customDim !== null ? customDim : curfewOn ? scenario.dimFactor : 1.0;
  const aerosolTau = customTau !== null ? customTau : (city.aerosolTau ?? 0.22);
  const rhoGround = Math.max(0.04, Math.min(0.85, Number(city.surfaceAlbedo ?? 0.14)));
  const rhoWall = 0.25;

  const nightHoursYear = 4100;
  const curfewHoursYear = ((scenario.curfewEndHour - scenario.curfewStartHour + 24) % 24) * 365;
  const fullHoursYear = Math.max(0, nightHoursYear - curfewHoursYear);

  const totalWattage = fixtures.reduce((acc, f) => acc + (f.wattage || 120), 0);
  const annualKwh =
    (totalWattage * (fullHoursYear * 1.0 + curfewHoursYear * scenario.dimFactor)) / 1000;
  const annualCost = annualKwh * city.tariffPerKwh;
  const totalCapex = n * scenario.capexPerFixture;

  // Per-fixture area-integrated cosine-power illuminance (using 3D ray trace when available)
  let luxSum = 0;
  let weightedSvfSum = 0;
  const rFracs = [0.15, 0.35, 0.55, 0.75, 0.92];
  for (const f of fixtures) {
    const w = f.wattage || 120;
    const h = Math.max(1, f.heightM || 10);
    if (f.rayTrace && typeof f.rayTrace.meanGroundLux === "number") {
      luxSum += f.rayTrace.meanGroundLux * (activeDim / (f.rayTrace.dimUsed || activeDim || 1));
    } else {
      const spreadM = computeLightSpreadRadiusM(h, f.ufr);
      let wLux = 0;
      let wArea = 0;
      for (const rf of rFracs) {
        const r = Math.max(1.0, rf * spreadM);
        wLux += computeGroundIlluminanceAt(r, h, w, f.efficacyLmW || 130, activeDim, f.ufr) * r;
        wArea += r;
      }
      luxSum += wArea > 0 ? wLux / wArea : 0;
    }
    const svf = f.rayTrace?.directEscapeFactor ?? (typeof f.skyViewFactor === "number" ? f.skyViewFactor : 1.0);
    weightedSvfSum += svf * w;
  }
  const meanGroundLux = n > 0 ? luxSum / n : 0;
  const meanSkyView = totalWattage > 0 ? weightedSvfSum / totalWattage : 1.0;

  // Radiative uplight combining direct UFR, 3D canopy escape, ground albedo, and 1-bounce wall reflection
  const refTotalWattage = 16 * 120;
  const fixtureFluxScale = n > 0 ? totalWattage / refTotalWattage : 0;
  const weighted = (fn) =>
    totalWattage > 0 ? fixtures.reduce((sum, f) => sum + (f.wattage || 120) * fn(f), 0) / totalWattage : 0;
  const refDenom = 0.14 + 0.14 * 0.86;
  const spectralUplight = weighted((f) => {
    const directEsc = f.rayTrace?.directEscapeFactor ?? (f.skyViewFactor ?? 1.0);
    const groundEsc = f.rayTrace?.groundEscapeFactor ?? (f.skyViewFactor ?? 1.0);
    const wallFrac = f.rayTrace?.wallInterceptFraction ?? 0;
    const upwardFraction =
      f.ufr * directEsc +
      (1 - f.ufr) * (1 - wallFrac) * rhoGround * groundEsc +
      (1 - f.ufr) * wallFrac * rhoWall * 0.5 * directEsc;
    return (upwardFraction / refDenom) * spectralScatteringFactor(f.cct);
  });
  const blueFactor = weighted((f) => spectralScatteringFactor(f.cct));
  const msi = weighted((f) => melatoninSuppressionIndex(f.cct));
  const modeledRadiance =
    city.baselineViirsRadiance * fixtureFluxScale * activeDim * spectralUplight;

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
    aerosolTau,
    meanSkyView,
    rhoGround
  };
}

export function generateHeatmapPoints(city, scenario, localHour, customDim = null, customTau = null) {
  const curfewOn = isCurfewActive(localHour, scenario.curfewStartHour, scenario.curfewEndHour);
  const activeDim = customDim !== null ? customDim : curfewOn ? scenario.dimFactor : 1.0;
  const points = [];
  for (const f of city.fixtures.map((fixture) => effectiveFixture(fixture, scenario))) {
    if (f.rayTrace?.groundSamples?.length) {
      for (const s of f.rayTrace.groundSamples) {
        points.push({
          position: s.position,
          weight: s.weight * 0.6
        });
      }
    } else {
      const h = Math.max(1, f.heightM || 10);
      const centerLux = computeGroundIlluminanceAt(0, h, f.wattage || 120, f.efficacyLmW || 130, activeDim, f.ufr);
      points.push({
        position: [f.lon, f.lat],
        weight: centerLux * 0.6
      });
    }
  }
  return points;
}

export function computeBaciStats(tBefore, tAfter, cBefore, cAfter) {
  const groups = [tBefore, tAfter, cBefore, cAfter];
  if (groups.some((g) => !Array.isArray(g) || g.length < 2 || !g.every(Number.isFinite))) {
    throw new RangeError("BACI requires at least two finite observations per group.");
  }
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
  const tStat = se > 0 ? deltaBaci / se : null;
  const ciHalf = 1.96 * se;

  return {
    deltaBaci,
    se,
    tStat,
    ciLow: se > 0 ? deltaBaci - ciHalf : null,
    ciHigh: se > 0 ? deltaBaci + ciHalf : null,
    significant: se > 0 && Math.abs(tStat) > 1.96
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
        { ...baseScenario, ufr, cctKelvin: cct, spectralOverride: true },
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

// Distance from the origin to the entire wall, including walls with distant endpoints.
export function distanceToSegmentM(ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(ax + t * vx, ay + t * vy);
}
