// MapLibre GL JS + deck.gl (Heatmap, Scatterplot, GeoJsonLayer) + NASA GIBS VIIRS
import { generateHeatmapPoints } from "./physics.js";

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
        viirs: BASEMAP_SOURCES.viirs
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
        }
      ]
    }
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

  deckOverlay = new deck.MapboxOverlay({
    interleaved: false,
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
    const heatPoints = generateHeatmapPoints(city, scenario, localHour, customDim, customTau);
    layers.push(
      new deck.HeatmapLayer({
        id: "lux-heatmap",
        visible: true,
        data: heatPoints,
        getPosition: (d) => d.position,
        getWeight: (d) => d.weight,
        radiusPixels: 56,
        intensity: 1.5,
        threshold: 0.03,
        colorRange: [
          [11, 19, 43, 0],
          [29, 78, 216, 130],
          [6, 182, 212, 180],
          [253, 224, 71, 210],
          [255, 255, 255, 240]
        ]
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
          const cct = d.cct ?? scenario.cctKelvin;
          return cct <= 2800 ? [251, 191, 36, 230] : [0, 113, 227, 230];
        },
        getLineColor: [255, 255, 255, 230],
        updateTriggers: {
          getPosition: city.fixtures.map((f) => `${f.id}:${f.lon}:${f.lat}`).join("|"),
          getRadius: selectedFixtureId,
          getFillColor: `${selectedFixtureId}|${scenario.cctKelvin}|${city.fixtures.map((f) => f.cct).join(",")}`
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
