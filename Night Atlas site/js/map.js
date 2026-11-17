// MapLibre GL JS + deck.gl (Heatmap, Scatterplot, GeoJsonLayer) + NASA GIBS VIIRS
import {
  effectiveFixture,
  isCurfewActive,
  generateHeatmapPoints,
  computeSkyViewFactor,
  computeLightSpreadRadiusM,
  computeRayPolygonVisibility,
  traceFixture3D
} from "./physics.js";

let map = null;
let deckOverlay = null;
let currentGeoJson = null;

const BASEMAP_SOURCES = {
  dark: {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
    ],
    tileSize: 256,
    maxzoom: 16,
    attribution: "Tiles © Esri — Dark Gray Canvas"
  },
  streets: {
    type: "raster",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 19,
    attribution: "© OpenStreetMap contributors"
  },
  satellite: {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    ],
    tileSize: 256,
    maxzoom: 17,
    attribution: "Tiles © Esri — World Imagery"
  },
  viirs: {
    type: "raster",
    tiles: [
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"
    ],
    tileSize: 256,
    maxzoom: 8,
    attribution: "NASA GIBS / Black Marble VIIRS"
  }
};

export function initMap(containerId, city) {
  map = new maplibregl.Map({
    container: containerId,
    center: city.center,
    zoom: city.zoom,
    pitch: city.pitch,
    bearing: city.bearing,
    antialias: true,
    style: {
      version: 8,
      sources: {
        dark: BASEMAP_SOURCES.dark,
        streets: BASEMAP_SOURCES.streets,
        satellite: BASEMAP_SOURCES.satellite,
        viirs: BASEMAP_SOURCES.viirs,
        openmap: {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet"
        }
      },
      layers: [
        { id: "layer-dark", type: "raster", source: "dark", layout: { visibility: "visible" } },
        { id: "layer-streets", type: "raster", source: "streets", layout: { visibility: "none" } },
        { id: "layer-satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
        {
          id: "layer-viirs",
          type: "raster",
          source: "viirs",
          layout: { visibility: "visible" },
          paint: { "raster-opacity": 0.48 }
        },
        {
          id: "3d-buildings",
          source: "openmap",
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 13,
          paint: {
            "fill-extrusion-color": "#1c212b",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.78
          }
        }
      ]
    }
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

  deckOverlay = new deck.MapboxOverlay({
    interleaved: true,
    layers: []
  });
  map.addControl(deckOverlay);

  return map;
}

export function setBasemap(mode) {
  if (!map || !map.isStyleLoaded()) return;
  ["dark", "streets", "satellite"].forEach((id) => {
    map.setLayoutProperty(`layer-${id}`, "visibility", id === mode ? "visible" : "none");
  });
}

export function toggleViirsOverlay(enabled) {
  if (!map || !map.isStyleLoaded()) return;
  map.setLayoutProperty("layer-viirs", "visibility", enabled ? "visible" : "none");
}

export function flyToCity(city) {
  if (!map) return;
  map.flyTo({
    center: city.center,
    zoom: city.zoom ?? 13.8,
    pitch: city.pitch ?? 40,
    bearing: city.bearing ?? 0,
    duration: 1900,
    curve: 1.35,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });
}

export function setQgisGeoJson(geojson) {
  currentGeoJson = geojson;
}

export function updateFixtureSkyViewFactors(city) {
  if (!map || !map.isStyleLoaded() || !map.getLayer("3d-buildings") || map.getZoom() < 13) return;
  for (const f of city.fixtures || []) {
    const pt = map.project([f.lon, f.lat]);
    const feats = map.queryRenderedFeatures(
      [[pt.x - 18, pt.y - 18], [pt.x + 18, pt.y + 18]],
      { layers: ["3d-buildings"] }
    );
    if (!feats.length) {
      f.nearbyBuildingHeightM = 0;
      f.skyViewFactor = 1.0;
      continue;
    }
    let hSum = 0;
    let hCount = 0;
    for (const feat of feats) {
      const rh = Number(feat.properties?.render_height ?? feat.properties?.height ?? 10);
      if (Number.isFinite(rh) && rh > 0) {
        hSum += rh;
        hCount++;
      }
    }
    const meanH = hCount > 0 ? hSum / hCount : 0;
    f.nearbyBuildingHeightM = Number(meanH.toFixed(1));
    f.skyViewFactor = Number(computeSkyViewFactor(meanH, 15).toFixed(3));
  }
}

const buildingCache = new Map();
function getRenderedBuildingPolygons() {
  const buildingPolys = [];
  if (map && map.isStyleLoaded() && map.getLayer("3d-buildings") && map.getZoom() >= 13) {
    try {
      const feats = map.querySourceFeatures("openmap", { sourceLayer: "building" });
      for (const feat of feats) {
        const geom = feat.geometry;
        if (!geom) continue;
        const h = Number(feat.properties?.render_height ?? feat.properties?.height ?? 10);
        if (geom.type === "Polygon" && geom.coordinates?.[0]) {
          buildingPolys.push({ heightM: h, ring: geom.coordinates[0] });
        } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
          for (const poly of geom.coordinates) {
            if (poly?.[0]) buildingPolys.push({ heightM: h, ring: poly[0] });
          }
        }
      }
    } catch {
      // Fallback to unobstructed ray-cast if style/tiles are mid-transition
    }
  }
  for (const b of buildingPolys) buildingCache.set(JSON.stringify([b.heightM, b.ring]), b);
  // Retain loaded walls when the camera crops them out at close zoom.
  while (buildingCache.size > 20000) buildingCache.delete(buildingCache.keys().next().value);
  return [...buildingCache.values()];
}

export function updateFixtureRayTraces(city, scenario, localHour, customDim = null) {
  const buildingPolys = getRenderedBuildingPolygons();
  const curfewOn = isCurfewActive(localHour, scenario.curfewStartHour, scenario.curfewEndHour);
  const activeDim = customDim !== null ? customDim : curfewOn ? scenario.dimFactor : 1.0;
  const rhoGround = Number(city.surfaceAlbedo ?? 0.14);

  for (const f of city.fixtures || []) {
    const eff = effectiveFixture(f, scenario);
    const trace = traceFixture3D(eff, buildingPolys, activeDim, rhoGround, 0.25);
    f.rayTrace = trace;
    f.skyViewFactor = Number(trace.directEscapeFactor.toFixed(3));
  }
  return buildingPolys;
}

export function updateSimulationLayers(
  city,
  scenario,
  localHour,
  customDim,
  customTau,
  onSelectFixture,
  onSelectPolygon,
  showLights = true,
  selectedFixtureId = null
) {
  if (!deckOverlay) return;
  const layers = [];

  if (showLights) {
    const buildingPolys = getRenderedBuildingPolygons();
    const heatPoints = generateHeatmapPoints(city, scenario, localHour, customDim, customTau);
    const curfewOn = isCurfewActive(localHour, scenario.curfewStartHour, scenario.curfewEndHour);
    const activeDim = customDim !== null ? customDim : curfewOn ? scenario.dimFactor : 1.0;
    const rhoGround = Number(city.surfaceAlbedo ?? 0.14);

    const groundCells = [];
    const lightFootprints = [];
    const lightPoles = [];
    const lightRays = [];
    const lightHeads = [];
    const wallHits = [];
    for (const f of city.fixtures || []) {
      const h = Math.max(1, f.heightM || 10);
      const eff = effectiveFixture(f, scenario);
      const { ufr, cct } = eff;
      const trace = f.rayTrace || traceFixture3D(eff, buildingPolys, activeDim, rhoGround, 0.25);
      const ring = trace.perimeter?.length
        ? trace.perimeter
        : computeRayPolygonVisibility([f.lon, f.lat], computeLightSpreadRadiusM(h, ufr), buildingPolys, 48, h);
      groundCells.push(...(trace.groundCells || []));
      lightFootprints.push({ id: f.id, cct, polygon: ring });
      lightPoles.push({
        source: [f.lon, f.lat, 0],
        target: [f.lon, f.lat, h],
        isSelected: f.id === selectedFixtureId
      });
      lightHeads.push({
        id: f.id,
        position: [f.lon, f.lat, h],
        cct,
        isSelected: f.id === selectedFixtureId
      });
      const hits = f.id === selectedFixtureId ? (trace.rayHits || []) : [];
      for (let i = 0; i < hits.length; i += 4) {
        const hit = hits[i];
        lightRays.push({
          source: [f.lon, f.lat, h],
          target: [hit.lon, hit.lat, hit.z],
          cct,
          isUpward: false,
          hitWall: hit.hitWall
        });
        if (hit.hitWall) {
          wallHits.push({
            position: [hit.lon, hit.lat, hit.z],
            cct
          });
        }
      }
      if (ufr > 0.02 && f.id === selectedFixtureId) {
        const spillDeg = 0.00018;
        for (const [dx, dy] of [[spillDeg, 0], [-spillDeg, 0], [0, spillDeg], [0, -spillDeg]]) {
          lightRays.push({
            source: [f.lon, f.lat, h],
            target: [f.lon + dx, f.lat + dy, h + 16],
            cct,
            isUpward: true,
            hitWall: false
          });
        }
      }
    }

    const fxTrigger = (city.fixtures || [])
      .map((f) => `${f.id}:${f.lon}:${f.lat}:${f.heightM}:${f.ufr}:${f.cct}`)
      .join("|");

    layers.push(
      new deck.PolygonLayer({
        id: "ground-illuminance",
        beforeId: "3d-buildings",
        data: groundCells,
        stroked: false,
        filled: true,
        getPolygon: (d) => d.polygon,
        getFillColor: (d) => {
          // Fixed 0–20 lux scale: moving the camera cannot renormalize brightness.
          const stops = [[11,19,43], [29,78,216], [6,182,212], [253,224,71], [255,255,255]];
          const t = Math.max(0, Math.min(4, d.lux / 5));
          const i = Math.min(3, Math.floor(t)), f = t - i;
          return [...stops[i].map((v, k) => Math.round(v + f * (stops[i + 1][k] - v))), Math.round(210 * Math.min(1, d.lux / 2))];
        }
      }),
      new deck.LineLayer({
        id: "light-beam-rays",
        visible: true,
        data: lightRays,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getWidth: 1,
        widthUnits: "pixels",
        getColor: (d) => {
          if (d.isUpward) return [255, 100, 90, 170];
          return d.cct <= 2800 ? [253, 224, 71, 150] : [125, 211, 252, 150];
        },
        updateTriggers: {
          getSourcePosition: fxTrigger,
          getTargetPosition: `${fxTrigger}|${buildingPolys.length}`,
          getColor: `${fxTrigger}|${scenario.cctKelvin}`
        }
      }),
      new deck.ScatterplotLayer({
        id: "wall-hit-points",
        visible: true,
        data: wallHits,
        filled: true,
        radiusMinPixels: 3,
        radiusMaxPixels: 6,
        getPosition: (d) => d.position,
        getRadius: 0.9,
        getFillColor: (d) => (d.cct <= 2800 ? [253, 224, 71, 235] : [125, 211, 252, 235]),
        updateTriggers: {
          getPosition: `${fxTrigger}|${buildingPolys.length}`,
          getFillColor: `${fxTrigger}|${scenario.cctKelvin}`
        }
      }),
      new deck.LineLayer({
        id: "light-poles",
        visible: true,
        data: lightPoles,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getWidth: 4,
        widthUnits: "pixels",
        getColor: (d) => (d.isSelected ? [48, 209, 88, 250] : [220, 225, 235, 235]),
        updateTriggers: {
          getSourcePosition: fxTrigger,
          getTargetPosition: fxTrigger,
          getColor: selectedFixtureId
        }
      }),
      new deck.ScatterplotLayer({
        id: "light-heads",
        visible: true,
        data: lightHeads,
        stroked: true,
        filled: true,
        radiusMinPixels: 4,
        radiusMaxPixels: 9,
        lineWidthMinPixels: 1.5,
        getPosition: (d) => d.position,
        getRadius: (d) => (d.isSelected ? 2.2 : 1.6),
        getFillColor: (d) => (d.cct <= 2800 ? [253, 224, 71, 255] : [186, 230, 253, 255]),
        getLineColor: (d) => (d.isSelected ? [48, 209, 88, 255] : [255, 255, 255, 220]),
        updateTriggers: {
          getPosition: fxTrigger,
          getRadius: selectedFixtureId,
          getFillColor: `${fxTrigger}|${scenario.cctKelvin}`,
          getLineColor: selectedFixtureId
        }
      }),
      new deck.ScatterplotLayer({
        id: "fixture-nodes",
        visible: true,
        data: city.fixtures.map((f) => ({ ...f })),
        pickable: true,
        stroked: true,
        filled: true,
        radiusScale: 1,
        radiusMinPixels: 5,
        radiusMaxPixels: 13,
        lineWidthMinPixels: 1.5,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => (d.id === selectedFixtureId ? 20 : 14),
        getFillColor: (d) => {
          if (d.id === selectedFixtureId) return [48, 209, 88, 245];
          const { cct } = effectiveFixture(d, scenario);
          return cct <= 2800 ? [251, 191, 36, 230] : [0, 113, 227, 230];
        },
        getLineColor: [255, 255, 255, 230],
        updateTriggers: {
          getPosition: fxTrigger,
          getRadius: selectedFixtureId,
          getFillColor: `${selectedFixtureId}|${scenario.cctKelvin}|${fxTrigger}`
        },
        onClick: (info) => {
          if (info.object && onSelectFixture) {
            const liveFx = city.fixtures.find((f) => f.id === info.object.id) || info.object;
            onSelectFixture(liveFx);
          }
        }
      })
    );
  }

  if (currentGeoJson) {
    layers.push(
      new deck.GeoJsonLayer({
        id: "qgis-geojson-layer",
        data: currentGeoJson,
        pickable: true,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 2,
        getFillColor: [0, 113, 227, 45],
        getLineColor: [56, 189, 248, 220],
        onClick: (info) => {
          if (info.object && onSelectPolygon) onSelectPolygon(info.object);
        }
      })
    );
  }

  deckOverlay.setProps({ layers });
  map?.triggerRepaint();
}
