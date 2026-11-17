// Night Atlas — Main Application Controller (v2.7 Complete Interactive Lab)
import { CITY_PRESETS, SCENARIOS, generateGridFixtures } from "./presets.js";
import {
  traceFixture3D,
  effectiveFixture,
  computeScenarioMetrics,
  computeBaciStats,
  computeCalibrationMetrics,
  auditMunicipalInventory,
  summarizeGeoJson,
  evaluatePolicyCompliance,
  computeSensitivitySweep,
  formatNumber
} from "./physics.js";
import {
  initMap,
  setBasemap,
  toggleViirsOverlay,
  flyToCity,
  setQgisGeoJson,
  updateSimulationLayers,
  updateFixtureSkyViewFactors,
  updateFixtureRayTraces
} from "./map.js";

const state = {
  activeView: "atlas",
  city: { ...structuredClone(CITY_PRESETS.geneva), fixtures: [] },
  scenarioId: "baseline",
  localHour: 22,
  customDimOverride: null,
  customTauOverride: null,
  viirsOn: true,
  lightsVisible: false,
  interactionMode: "navigate",
  drawnRing: [],
  uploadedSqmPairs: null,
  uploadedBaci: null,
  uploadedInventory: null,
  selectedFixture: null
};

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
}

const SAMPLE_SQM_PAIRS = [
  { id: "SQM-01", observed: 18.24, modeled: 18.31 },
  { id: "SQM-02", observed: 18.42, modeled: 18.38 },
  { id: "SQM-03", observed: 20.38, modeled: 20.33 },
  { id: "SQM-04", observed: 19.65, modeled: 19.72 },
  { id: "SQM-05", observed: 18.61, modeled: 18.58 },
  { id: "SQM-06", observed: 21.29, modeled: 21.25 }
];

const SAMPLE_INVENTORY = [
  { id: "ST-101", lat: 55.6542, lon: 37.4831, wattage: 150, cct: 4000, ufr: 0.16, heightM: 12 },
  { id: "ST-102", lat: 55.6558, lon: 37.4864, wattage: 140, cct: 4000, ufr: 0.14, heightM: 12 },
  { id: "ST-103", lat: 55.6561, lon: 37.4882, wattage: 110, cct: 3000, ufr: 0.05, heightM: 10 },
  { id: "ST-104", lat: 55.6539, lon: 37.4849, wattage: 180, cct: 5000, ufr: 0.18, heightM: 14 },
  { id: "ST-105", lat: 55.657, lon: 37.4855, wattage: 85, cct: 2700, ufr: 0.01, heightM: 10 },
  { id: "ST-106", lat: 55.6547, lon: 37.4877, wattage: 160, cct: 4000, ufr: 0.12, heightM: 12 }
];

let mapInstance = null;

function showToast(msg) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 4200);
}

function renderLatex() {
  if (typeof window.renderMathInElement === "function") {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false }
      ],
      throwOnError: false
    });
  }
}

function switchView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `view-${viewId}`);
  });
  if (viewId === "atlas") mapInstance?.resize();
  if (viewId === "scenarios") renderScenarioComparison();
  if (viewId === "physics") renderSensitivityChart();
  if (viewId === "calibration") renderCalibrationAndBaci(state.uploadedSqmPairs ?? SAMPLE_SQM_PAIRS);
  if (viewId === "audit") renderMunicipalAudit(state.uploadedInventory ?? SAMPLE_INVENTORY);
  if (viewId === "physics" || viewId === "research" || viewId === "calibration") renderLatex();
}

function injectExpansionUI() {
  const presetSelect = document.getElementById("city-preset-select");
  if (presetSelect) {
    presetSelect.innerHTML = Object.values(CITY_PRESETS)
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join("");
    presetSelect.value = "geneva";
  }

  // Populate 04 Research Paper with Mark Vilpan's empirical 5-district Moscow VIIRS findings
  const researchContainer = document.querySelector("#view-research .container-narrow");
  if (researchContainer) {
    const meta = researchContainer.querySelector(".paper-meta");
    if (meta) {
      meta.innerHTML = `
        <span><strong>Author:</strong> Mark Vilpan (Lyceum “Second School”, Moscow)</span>
        <span><strong>Supervisor:</strong> I.E. Ivanova</span>
        <span><strong>Sensor:</strong> NASA/NOAA VIIRS DNB (Dec–Jan 2022–2023)</span>
      `;
    }
    const empiricalCard = document.createElement("div");
    empiricalCard.className = "card-surface";
    empiricalCard.innerHTML = `
      <h2>Empirical Moscow Baseline (Vilpan, 2026)</h2>
      <p style="font-size:13.5px;color:var(--text-secondary);">
        Zonal statistics extracted in QGIS (<code>WGS 84 / UTM zone 37N</code>) from cloud-free, new-moon VIIRS Day/Night Band scenes across five functional land-use zones, classified via Falchi et al. (2016) thresholds (Class 1: &lt;5, Class 2: 5–15, Class 3: 15–50, Class 4: &gt;50 nW·cm⁻²·sr⁻¹).
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th>Moscow District</th>
            <th>Land-Use Type</th>
            <th>Mean Radiance ($L_{\\text{NTL}}$)</th>
            <th>Dominant Class</th>
            <th>Key Mitigation Target</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>Presnensky (Moscow-City)</strong></td><td>High-rise Business</td><td>58 nW·cm⁻²·sr⁻¹ (peak &gt;150)</td><td>Class 4 (Extreme)</td><td>Media facades &amp; architectural uplight</td></tr>
          <tr><td><strong>Arbat</strong></td><td>Historic Core</td><td>42 nW·cm⁻²·sr⁻¹</td><td>Class 4 (Continuous)</td><td>Heritage &amp; pedestrian shielding</td></tr>
          <tr><td><strong>Yuzhny Port</strong></td><td>Industrial / Logistics</td><td>25 nW·cm⁻²·sr⁻¹</td><td>Class 4 hotspots / Class 1–2 dark</td><td>Unshielded perimeter floodlights</td></tr>
          <tr><td><strong>Novye Cheryomushki</strong></td><td>Residential</td><td>18 nW·cm⁻²·sr⁻¹</td><td>Class 4 arterials / Class 2–3 yards</td><td>Adaptive midnight arterial dimming</td></tr>
          <tr><td><strong>Losiny Ostrov National Park</strong></td><td>Protected Urban Forest</td><td>8 nW·cm⁻²·sr⁻¹ (core 3–4)</td><td>Class 2 (Perimeter Class 3)</td><td>External urban buffer zoning</td></tr>
        </tbody>
      </table>
    `;
    researchContainer.appendChild(empiricalCard);
  }

  const dockLeft = document.querySelector(".dock-left");
  const temporalBlock = dockLeft.children[2];

  const primaryToggle = document.createElement("div");
  primaryToggle.style.display = "flex";
  primaryToggle.style.flexDirection = "column";
  primaryToggle.style.gap = "6px";
  primaryToggle.innerHTML = `
    <div style="display:flex;gap:6px;">
      <button class="btn" id="btn-toggle-lights" style="flex:1;justify-content:center;">Show Lights</button>
      <button class="btn" id="btn-clear-lights" style="color:var(--accent-rose);justify-content:center;" title="Remove all lights from map">Clear</button>
    </div>
    <div style="display:flex;gap:6px;align-items:center;">
      <select id="place-count-select" class="city-select" style="width:74px;padding:6px 8px;" title="Lights to add per click">
        <option value="1" selected>1×</option>
        <option value="2">2×</option>
        <option value="4">4×</option>
        <option value="8">8×</option>
        <option value="16">16×</option>
        <option value="25">25×</option>
      </select>
      <button class="btn mode-btn" data-mode="place_light" id="btn-quick-place" style="flex:1;justify-content:center;">+ Place Light</button>
    </div>
  `;
  dockLeft.insertBefore(primaryToggle, temporalBlock);

  const drawer = document.createElement("details");
  drawer.className = "lab-drawer";
  drawer.innerHTML = `
    <summary>Advanced Lab</summary>
    <div class="lab-drawer-body">
      <div class="slider-row">
        <div class="slider-header">
          <span>Aerosol Optical Depth $\\tau$</span>
          <span class="slider-val" id="tau-val">0.16</span>
        </div>
        <input id="tau-slider" type="range" min="0.05" max="0.80" step="0.01" value="0.16" />
      </div>
      <div class="slider-row">
        <div class="slider-header">
          <span>Surface Albedo $\\rho$</span>
          <span class="slider-val" id="albedo-val">0.14</span>
        </div>
        <input id="albedo-slider" type="range" min="0.05" max="0.75" step="0.01" value="0.14" />
      </div>
      <div class="slider-row">
        <div class="slider-header">
          <span>Map Zoom</span>
          <span class="slider-val" id="zoom-val">13.6</span>
        </div>
        <input id="zoom-slider" type="range" min="2.0" max="18.0" step="0.1" value="13.6" />
      </div>
      <div class="slider-row">
        <div class="slider-header">
          <span>Baseline VIIRS $L_{\\text{NTL}}$ (nW)</span>
          <span class="slider-val" id="viirs-baseline-val">26.8</span>
        </div>
        <input id="viirs-baseline-slider" type="range" min="1" max="150" step="0.5" value="26.8" />
      </div>
      <div>
        <div class="dock-section-label">NASA VIIRS Epoch</div>
        <select id="viirs-epoch-select" class="city-select">
          <option value="2016">Black Marble 2016 Composite</option>
          <option value="2012">Black Marble 2012 Composite</option>
          <option value="daily">VIIRS SNPP Daily DNB (2026-11-10)</option>
        </select>
      </div>
      <div>
        <div class="dock-section-label">Interactive Map Tools</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
          <button class="seg-btn mode-btn active" data-mode="navigate">Navigate</button>
          <button class="seg-btn mode-btn" data-mode="place_light">+ Place Light</button>
          <button class="seg-btn mode-btn" data-mode="move_light">Move Light</button>
          <button class="seg-btn mode-btn" data-mode="draw_zone">Draw Zone</button>
        </div>
        <button class="btn" id="btn-clear-drawn" style="width:100%;justify-content:center;">Clear Drawn Zone</button>
      </div>
      <div>
        <div class="dock-section-label">QGIS Vector Overlay</div>
        <label class="btn" style="width:100%;justify-content:center;">
          Load QGIS GeoJSON
          <input id="qgis-geojson-input" type="file" accept=".geojson,.json" hidden />
        </label>
        <div id="qgis-status" style="font-size:11px;color:var(--text-muted);margin-top:6px;">No polygon loaded</div>
      </div>
    </div>
  `;
  const drawerBody = drawer.querySelector(".lab-drawer-body");
  if (temporalBlock) drawerBody.prepend(temporalBlock);
  dockLeft.appendChild(drawer);

  const dockRight = document.querySelector(".dock-right");
  const complianceBox = document.createElement("div");
  complianceBox.innerHTML = `
    <div class="dock-section-label">Illustrative scenario checks</div>
    <div id="compliance-badges" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
  `;
  dockRight.insertBefore(complianceBox, dockRight.lastElementChild);

  const inspectWrap = dockRight.lastElementChild;
  if (inspectWrap) {
    inspectWrap.innerHTML = `
      <div class="dock-section-label">Fixture Editor</div>
      <div id="fixture-editor-empty" style="font-size:12px;color:var(--text-muted);">
        Click any fixture on the map to edit wattage, CCT, height, or move it.
      </div>
      <div id="fixture-editor-form" style="display:none;flex-direction:column;gap:8px;">
        <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);" id="fx-edit-title"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label style="font-size:11px;color:var(--text-secondary);">Wattage (W)
            <input id="fx-edit-watt" class="city-select" type="number" min="20" max="500" step="5" />
          </label>
          <label style="font-size:11px;color:var(--text-secondary);">Height (m)
            <input id="fx-edit-height" class="city-select" type="number" min="3" max="35" step="1" />
          </label>
          <label style="font-size:11px;color:var(--text-secondary);">CCT (K)
            <select id="fx-edit-cct" class="city-select">
              <option value="2200">2200 K</option>
              <option value="2700">2700 K</option>
              <option value="3000">3000 K</option>
              <option value="4000">4000 K</option>
              <option value="5000">5000 K</option>
            </select>
          </label>
          <label style="font-size:11px;color:var(--text-secondary);">UFR (0–0.3)
            <input id="fx-edit-ufr" class="city-select" type="number" min="0" max="0.3" step="0.01" />
          </label>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);" id="fx-edit-stats"></div>
        <button class="btn" id="btn-fx-retrofit" style="width:100%;justify-content:center;color:var(--accent-emerald);">Convert to 2700K Full-Cutoff</button>
        <div style="display:flex;gap:6px;margin-top:2px;">
          <button class="btn" id="btn-fx-move" style="flex:1;justify-content:center;">Move on Map</button>
          <button class="btn" id="btn-fx-delete" style="color:var(--accent-rose);">Delete</button>
        </div>
      </div>
    `;
  }

  const physicsContainer = document.querySelector("#view-physics .container-narrow");
  if (physicsContainer) {
    const sensCard = document.createElement("div");
    sensCard.className = "card-surface";
    sensCard.innerHTML = `
      <h2>5. Radiative Sensitivity Sweep ($\\mu_z$ vs. UFR &amp; CCT)</h2>
      <p style="font-size:13px;color:var(--text-secondary);">
        Modeled zenith sky brightness ($\\mu_z$) across Upward Flux Ratio ($0\\%\\text{–}20\\%$) for 2700K, 3000K, and 4000K spectra at the active city's aerosol optical depth ($\\tau$).
      </p>
      <div id="sensitivity-chart" class="chart-box"></div>
    `;
    physicsContainer.appendChild(sensCard);

    const limitsCard = document.createElement("div");
    limitsCard.className = "card-surface";
    limitsCard.innerHTML = `
      <h2>6. 3D-Building Canyon &amp; Model Assumptions</h2>
      <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
        When zoomed to $z \\ge 13$, Night Atlas queries rendered <code>3d-buildings</code> heights ($H$) within an 18 px radius of each fixture to compute an urban-canyon Sky View Factor $\\psi_{\\text{sky}} = \\max(0.25, 1 - H / \\sqrt{H^2 + W^2})$ ($W = 15\\,\text{m}$), attenuating passive upward escape.
        <strong>Key Assumptions:</strong> (1) ground illuminance $E_h$ is evaluated at a fixed $12\\,\text{m}$ horizontal offset without ray-traced building shadows; (2) surface albedo is fixed at $\\rho = 0.14$ (snow-free asphalt); (3) Walker's Law ($r^{-2.5}$) and $k_{\\text{cal}} = 0.25$ are screening parameters; and (4) tall-building facade/media emissions (e.g., Moscow-City) are not modeled passively.
      </p>
    `;
    physicsContainer.appendChild(limitsCard);
  }

  // 2. Add 05 Calibration & BACI and 06 Municipal Audit tabs
  const nav = document.querySelector(".nav-tabs");
  const main = document.querySelector(".app-main");

  const calTab = document.createElement("button");
  calTab.className = "nav-tab";
  calTab.dataset.view = "calibration";
  calTab.textContent = "05 Calibration & BACI";
  nav.appendChild(calTab);

  const auditTab = document.createElement("button");
  auditTab.className = "nav-tab";
  auditTab.dataset.view = "audit";
  auditTab.textContent = "06 Municipal Audit";
  nav.appendChild(auditTab);

  const calSection = document.createElement("section");
  calSection.id = "view-calibration";
  calSection.className = "view-panel view-scroll";
  calSection.innerHTML = `
    <div class="container-narrow">
      <div class="hero-eyebrow">Empirical Validation &amp; Satellite Time-Series</div>
      <h1 class="hero-title">SQM Calibration &amp; BACI Estimator</h1>
      <p class="hero-lead">Validate modeled zenith sky brightness ($\\mu_z$) against Sky Quality Meter (SQM) readings and run Before-After-Control-Impact ($\\Delta_{\\text{BACI}}$) tests on NASA Black Marble VNP46A2/A4 radiance.</p>

      <div class="bento-grid">
        <div class="card-surface">
          <h2>SQM Ground-Truth Calibration</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <label class="btn">Upload SQM CSV <input id="sqm-file-input" type="file" accept=".csv" hidden /></label>
            <button class="btn" id="btn-export-sqm-svg">Export SVG Figure</button>
          </div>
          <div id="sqm-stats" style="font-size:13px;color:var(--text-secondary);"></div>
          <div id="sqm-chart" class="chart-box"></div>
        </div>

        <div class="card-surface">
          <h2>BACI Intervention Test</h2>
          <p style="font-size:13px;color:var(--text-secondary);">Evaluates VNP46A2 treatment vs. control corridor radiance before and after municipal retrofit.</p>
          <div style="margin-bottom:10px;">
            <label class="btn">Upload BACI CSV <input id="baci-file-input" type="file" accept=".csv" hidden /></label>
          </div>
          <div id="baci-stats" style="font-size:13px;margin-bottom:12px;"></div>
          <div id="baci-chart" class="chart-box"></div>
        </div>
      </div>
    </div>
  `;
  main.appendChild(calSection);

  const auditSection = document.createElement("section");
  auditSection.id = "view-audit";
  auditSection.className = "view-panel view-scroll";
  auditSection.innerHTML = `
    <div class="container-narrow">
      <div class="hero-eyebrow">Municipal Inventory &amp; Spectral Impact</div>
      <h1 class="hero-title">Retrofit Priority Action Plan</h1>
      <p class="hero-lead">Upload a municipal streetlight CSV (<code>id,lat,lon,wattage,cct,ufr,height_m</code>) to flag non-compliant fixtures ($\\text{UFR} &gt; 0.01$ or $\\text{CCT} &gt; 3000\\,\\text{K}$) and rank retrofits by skyglow reduction per dollar.</p>
      <div class="paper-actions">
        <label class="btn btn-primary">Upload Inventory CSV <input id="inv-file-input" type="file" accept=".csv" hidden /></label>
        <button class="btn" id="btn-export-audit-csv">Export Priority CSV</button>
      </div>
      <div class="card-surface">
        <h2>Ranked Fixture Audit</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Fixture</th>
              <th>Specs (W / CCT / UFR)</th>
              <th>Compliance</th>
              <th>Est. CapEx</th>
              <th>Energy Saved</th>
              <th>Priority Score</th>
            </tr>
          </thead>
          <tbody id="audit-table-body"></tbody>
        </table>
      </div>
    </div>
  `;
  main.appendChild(auditSection);
}

function renderSensitivityChart() {
  const series = computeSensitivitySweep(
    state.city,
    SCENARIOS[state.scenarioId],
    state.localHour,
    state.customTauOverride
  );
  const allVals = series.flatMap((s) => s.points.map((p) => p.zenithSkyMag));
  const minY = Math.min(...allVals) - 0.15;
  const maxY = Math.max(...allVals) + 0.15;
  const xMap = (ufrPct) => 40 + (ufrPct / 20) * 260;
  const yMap = (mag) => 170 - ((mag - minY) / Math.max(0.1, maxY - minY)) * 135;
  const colors = { 2700: "#ffd60a", 3000: "#30d158", 4000: "#0071e3" };

  const polylines = series
    .map((s) => {
      const pts = s.points.map((p) => `${xMap(p.ufrPct)},${yMap(p.zenithSkyMag)}`).join(" ");
      return `<polyline fill="none" stroke="${colors[s.cct]}" stroke-width="2.5" points="${pts}" />`;
    })
    .join("");

  const chartEl = document.getElementById("sensitivity-chart");
  if (!chartEl) return;
  chartEl.innerHTML = `
    <svg viewBox="0 0 340 205" width="100%" height="210" xmlns="http://www.w3.org/2000/svg">
      <line x1="40" y1="170" x2="300" y2="170" stroke="rgba(255,255,255,0.2)"/>
      <line x1="40" y1="170" x2="40" y2="30" stroke="rgba(255,255,255,0.2)"/>
      ${polylines}
      <text x="170" y="192" fill="#a1a1a6" font-size="10" text-anchor="middle">Upward Flux Ratio UFR (%)</text>
      <text x="14" y="100" fill="#a1a1a6" font-size="10" transform="rotate(-90 14 100)" text-anchor="middle">Zenith μz (mag/arcsec²)</text>
      <text x="50" y="20" fill="#ffd60a" font-size="9.5">● 2700K</text>
      <text x="115" y="20" fill="#30d158" font-size="9.5">● 3000K</text>
      <text x="180" y="20" fill="#0071e3" font-size="9.5">● 4000K</text>
    </svg>
  `;
}

function renderCalibrationAndBaci(pairs = SAMPLE_SQM_PAIRS) {
  const { r2, rmse, meanBias } = computeCalibrationMetrics(pairs);
  const isSample = state.uploadedSqmPairs === null;
  const r2Text = r2 !== null ? formatNumber(r2, 4) : "N/A (zero variance)";
  const rmseText = rmse !== null ? `${formatNumber(rmse, 3)} mag/arcsec²` : "N/A";
  const biasText = meanBias !== null ? `${meanBias >= 0 ? "+" : ""}${formatNumber(meanBias, 3)}` : "N/A";
  document.getElementById("sqm-stats").innerHTML = `
    <div><strong>$R^2$ = ${r2Text}</strong> &nbsp;·&nbsp; <strong>RMSE = ${rmseText}</strong> &nbsp;·&nbsp; <strong>Bias = ${biasText}</strong> (${pairs.length} stations)</div>
    <div style="font-size:11px;color:var(--accent-amber);margin-top:4px;">${isSample ? "Sample demonstration data — upload your SQM CSV to replace." : "Using uploaded SQM dataset."}</div>
  `;

  const minV = 17.5;
  const maxV = 22.0;
  const scale = (v) => 30 + ((v - minV) / (maxV - minV)) * 240;
  const dots = pairs
    .map((p) => {
      const cx = scale(p.observed);
      const cy = 270 - (scale(p.modeled) - 30);
      return `<circle cx="${cx}" cy="${cy}" r="5" fill="#0071e3" stroke="#ffffff" stroke-width="1.2"><title>${escapeHtml(p.id)}: Obs ${p.observed}, Mod ${p.modeled}</title></circle>`;
    })
    .join("");

  document.getElementById("sqm-chart").innerHTML = `
    <svg id="sqm-svg" viewBox="0 0 320 300" width="100%" height="240" xmlns="http://www.w3.org/2000/svg">
      <line x1="30" y1="270" x2="270" y2="30" stroke="rgba(255,255,255,0.25)" stroke-dasharray="4 4"/>
      <line x1="30" y1="270" x2="270" y2="270" stroke="rgba(255,255,255,0.2)"/>
      <line x1="30" y1="270" x2="30" y2="30" stroke="rgba(255,255,255,0.2)"/>
      ${dots}
      <text x="150" y="292" fill="#a1a1a6" font-size="10" text-anchor="middle">Observed SQM (mag/arcsec²)</text>
      <text x="14" y="150" fill="#a1a1a6" font-size="10" transform="rotate(-90 14 150)" text-anchor="middle">Modeled μz</text>
    </svg>
  `;

  const baciData = state.uploadedBaci ?? {
    tBefore: [48.1, 47.6, 48.9, 48.3, 47.9],
    tAfter: [21.4, 20.8, 22.1, 21.6, 21.0],
    cBefore: [44.2, 43.9, 44.8, 44.5, 44.1],
    cAfter: [43.8, 44.1, 44.5, 43.9, 44.0]
  };
  const baci = computeBaciStats(baciData.tBefore, baciData.tAfter, baciData.cBefore, baciData.cAfter);

  document.getElementById("baci-stats").innerHTML = `
    <div><strong>$\\Delta_{\\text{BACI}}$:</strong> ${formatNumber(baci.deltaBaci, 2)} nW·cm⁻²·sr⁻¹</div>
    <div><strong>Approx. 95% CI:</strong> [${baci.ciLow === null ? "N/A" : formatNumber(baci.ciLow, 2)}, ${baci.ciHigh === null ? "N/A" : formatNumber(baci.ciHigh, 2)}] &nbsp;·&nbsp; <strong>t =</strong> ${baci.tStat === null ? "N/A (zero variance)" : formatNumber(baci.tStat, 2)} (${baci.significant ? "normal approximation: significant" : "n.s."})</div>
    <div style="font-size:11px;color:var(--accent-amber);margin-top:4px;">${state.uploadedBaci ? "Using uploaded BACI dataset." : "Synthetic BACI demonstration series (offline mode)."}</div>
  `;

  const values = Object.values(baciData).flat();
  const low = Math.min(...values), high = Math.max(...values);
  const seriesPoints = (before, after) => [...before.map((v, i) => [20 + i * 125 / Math.max(1, before.length - 1), v]), ...after.map((v, i) => [175 + i * 120 / Math.max(1, after.length - 1), v])].map(([x, v]) => `${x},${145 - (v - low) * 110 / Math.max(1, high - low)}`).join(" ");
  document.getElementById("baci-chart").innerHTML = `
    <svg viewBox="0 0 320 180" width="100%" height="170" xmlns="http://www.w3.org/2000/svg">
      <line x1="160" y1="15" x2="160" y2="155" stroke="#ffd60a" stroke-dasharray="4 3"/>
      <text x="164" y="25" fill="#ffd60a" font-size="9">Retrofit Date</text>
      <polyline fill="none" stroke="#a1a1a6" stroke-width="2" points="${seriesPoints(baciData.cBefore, baciData.cAfter)}"/>
      <polyline fill="none" stroke="#0071e3" stroke-width="2.5" points="${seriesPoints(baciData.tBefore, baciData.tAfter)}"/>
      <text x="24" y="168" fill="#0071e3" font-size="9">● Treatment Corridor</text>
      <text x="165" y="168" fill="#a1a1a6" font-size="9">● Control Corridor</text>
    </svg>
  `;
}

function renderMunicipalAudit(inventory) {
  const ranked = auditMunicipalInventory(inventory);
  window._lastAuditRows = ranked;
  document.getElementById("audit-table-body").innerHTML = ranked
    .map(
      (f) => `
      <tr>
        <td><strong>${escapeHtml(f.id)}</strong><div style="font-size:11px;color:var(--text-muted)">${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}</div></td>
        <td>${f.wattage}W · ${f.cct}K · UFR ${f.ufr}</td>
        <td><span class="badge ${f.compliant ? "badge-pass" : "badge-fail"}">${f.compliant ? "Dark-Sky OK" : "Non-Compliant"}</span></td>
        <td>$${formatNumber(f.capex)}</td>
        <td>${formatNumber(f.annualKwhSaved)} kWh/yr</td>
        <td><strong>${formatNumber(f.priorityScore, 2)}</strong></td>
      </tr>
    `
    )
    .join("");
}

function commitFixtureEditorInputs() {
  const fx = state.selectedFixture;
  if (!fx) return;
  const w = parseFloat(document.getElementById("fx-edit-watt")?.value);
  if (Number.isFinite(w) && w > 0) fx.wattage = w;
  const h = parseFloat(document.getElementById("fx-edit-height")?.value);
  if (Number.isFinite(h) && h > 0) fx.heightM = h;
  const c = parseInt(document.getElementById("fx-edit-cct")?.value, 10);
  if (Number.isFinite(c)) fx.cct = c;
  const u = parseFloat(document.getElementById("fx-edit-ufr")?.value);
  if (Number.isFinite(u) && u >= 0) fx.ufr = Math.min(1, u);
}

function updateTelemetryAndMap() {
  const scenario = SCENARIOS[state.scenarioId];
  updateFixtureSkyViewFactors(state.city);
  updateFixtureRayTraces(state.city, scenario, state.localHour, state.customDimOverride);
  const baseMetrics = computeScenarioMetrics(state.city, SCENARIOS.baseline, state.localHour, null, state.customTauOverride);
  const m = computeScenarioMetrics(state.city, scenario, state.localHour, state.customDimOverride, state.customTauOverride);
  renderBuildingExperiment(m.activeDim);

  document.getElementById("kpi-energy").innerHTML = `${formatNumber(m.annualKwh)} <span class="kpi-unit">kWh/yr</span>`;
  document.getElementById("kpi-cost").innerHTML = `$${formatNumber(m.annualCost)} <span class="kpi-unit">/yr</span>`;
  document.getElementById("kpi-lux").innerHTML = `${formatNumber(m.meanGroundLux, 1)} <span class="kpi-unit">lx</span>`;
  document.getElementById("kpi-radiance").innerHTML = `${formatNumber(m.modeledRadiance, 1)} <span class="kpi-unit">nW</span>`;
  document.getElementById("kpi-skymag").innerHTML = `${formatNumber(m.zenithSkyMag, 2)} <span class="kpi-unit">mag/arcsec²</span>`;

  const costSavingsPct = ((baseMetrics.annualCost - m.annualCost) / Math.max(1, baseMetrics.annualCost)) * 100;
  const radDropPct = ((baseMetrics.modeledRadiance - m.modeledRadiance) / Math.max(0.1, baseMetrics.modeledRadiance)) * 100;

  document.getElementById("kpi-cost-delta").textContent =
    state.scenarioId === "baseline" ? "Reference" : `-${formatNumber(costSavingsPct, 1)}% vs baseline`;
  document.getElementById("kpi-rad-delta").textContent =
    state.scenarioId === "baseline" ? "Assumed radiance baseline" : `-${formatNumber(radDropPct, 1)}% uplight`;

  const comp = evaluatePolicyCompliance(scenario, m);
  const compEl = document.getElementById("compliance-badges");
  if (compEl) {
    compEl.innerHTML = comp.checks
      .map((c) => `<span class="badge ${c.pass ? "badge-pass" : "badge-fail"}">${c.pass ? "✓" : "✕"} ${c.label}</span>`)
      .join("");
  }

  document.getElementById("hour-val").textContent = `${String(state.localHour).padStart(2, "0")}:00`;
  document.getElementById("dim-val").textContent = `${Math.round(m.activeDim * 100)}%`;
  document.getElementById("tau-val").textContent = formatNumber(m.aerosolTau, 2);
  document.getElementById("city-desc").textContent = state.city.description;
  const countVal = document.getElementById("fixture-count-val");
  const countSlider = document.getElementById("fixture-count-slider");
  if (countVal) countVal.textContent = String(state.city.fixtures.length);
  if (countSlider) countSlider.value = String(Math.min(100, state.city.fixtures.length));
  const viirsBaseVal = document.getElementById("viirs-baseline-val");
  const viirsBaseSlider = document.getElementById("viirs-baseline-slider");
  if (viirsBaseVal) {
    viirsBaseVal.textContent = state.city.id === "custom" ? `${formatNumber(state.city.baselineViirsRadiance, 1)} (est.)` : formatNumber(state.city.baselineViirsRadiance, 1);
  }
  if (viirsBaseSlider) viirsBaseSlider.value = String(state.city.baselineViirsRadiance);

  const emptyEl = document.getElementById("fixture-editor-empty");
  const formEl = document.getElementById("fixture-editor-form");
  if (emptyEl && formEl) {
    if (state.selectedFixture) {
      emptyEl.style.display = "none";
      formEl.style.display = "flex";
      document.getElementById("fx-edit-title").textContent =
        `${state.selectedFixture.id} (${state.selectedFixture.lat.toFixed(4)}, ${state.selectedFixture.lon.toFixed(4)})`;
      const wattEl = document.getElementById("fx-edit-watt");
      const heightEl = document.getElementById("fx-edit-height");
      const cctEl = document.getElementById("fx-edit-cct");
      const ufrEl = document.getElementById("fx-edit-ufr");
      if (wattEl && document.activeElement !== wattEl) wattEl.value = state.selectedFixture.wattage;
      if (heightEl && document.activeElement !== heightEl) heightEl.value = state.selectedFixture.heightM;
      if (cctEl && document.activeElement !== cctEl) cctEl.value = String(state.selectedFixture.cct);
      if (ufrEl && document.activeElement !== ufrEl) ufrEl.value = state.selectedFixture.ufr;
      const fxStatsEl = document.getElementById("fx-edit-stats");
      if (fxStatsEl) {
        const fxKwh = ((state.selectedFixture.wattage || 120) * 4100) / 1000;
        const h = Math.max(1, state.selectedFixture.heightM || 10);
        const lum = (state.selectedFixture.wattage || 120) * (state.selectedFixture.efficacyLmW || 130) * m.activeDim * (1 - effectiveFixture(state.selectedFixture, scenario).ufr * 0.5);
        const d2 = 144 + h * h;
        const fxLux = (lum / (2 * Math.PI * d2)) * (h / Math.sqrt(d2));
        const svf = typeof state.selectedFixture.skyViewFactor === "number" ? state.selectedFixture.skyViewFactor : 1.0;
        const rt = state.selectedFixture.rayTrace;
        const meanLx = rt ? rt.meanGroundLux : fxLux;
        const peakLx = rt ? rt.peakGroundLux : fxLux;
        const escPct = rt ? Math.round(rt.directEscapeFactor * 100) : Math.round(svf * 100);
        fxStatsEl.textContent = `Est. ${formatNumber(fxKwh)} kWh/yr · Mean ${formatNumber(meanLx, 1)} lx (Peak ${formatNumber(peakLx, 1)} lx) · Escape ${escPct}%`;
      }
      const albedoValEl = document.getElementById("albedo-val");
      const albedoSliderEl = document.getElementById("albedo-slider");
      const rhoVal = Number(state.city.surfaceAlbedo ?? 0.14);
      if (albedoValEl) albedoValEl.textContent = formatNumber(rhoVal, 2);
      if (albedoSliderEl && document.activeElement !== albedoSliderEl) albedoSliderEl.value = String(rhoVal);
    } else {
      emptyEl.style.display = "block";
      formEl.style.display = "none";
    }
  }

  if (state.drawnRing.length >= 3) {
    setQgisGeoJson({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Custom Drawn Municipal Zone" },
          geometry: { type: "Polygon", coordinates: [[...state.drawnRing, state.drawnRing[0]]] }
        }
      ]
    });
  }

  updateSimulationLayers(
    state.city,
    scenario,
    state.localHour,
    state.customDimOverride,
    state.customTauOverride,
    (fx) => {
      commitFixtureEditorInputs();
      state._justClickedFixture = true;
      state.selectedFixture = state.city.fixtures.find((f) => f.id === fx.id) || fx;
      updateTelemetryAndMap();
      showToast(`Selected ${fx.id} — edit specs or click map in Move Light mode`);
    },
    (poly) => {
      const label = poly?.properties?.name || "QGIS Polygon";
      showToast(`Selected ${label}`);
    },
    state.lightsVisible,
    state.selectedFixture?.id ?? null
  );
}

function renderScenarioComparison() {
  const tbody = document.getElementById("scenario-table-body");
  const base = computeScenarioMetrics(state.city, SCENARIOS.baseline, state.localHour, null, state.customTauOverride);
  const rows = Object.values(SCENARIOS).map((sc) => {
    const m = computeScenarioMetrics(state.city, sc, state.localHour, null, state.customTauOverride);
    const comp = evaluatePolicyCompliance(sc, m);
    const savings = base.annualCost - m.annualCost;
    const payback = savings > 0 && m.totalCapex > 0 ? `${formatNumber(m.totalCapex / savings, 1)} yr` : "—";
    const radDrop = ((base.modeledRadiance - m.modeledRadiance) / Math.max(0.1, base.modeledRadiance)) * 100;
    return `
      <tr>
        <td><strong>${sc.name}</strong><div style="font-size:11px;color:var(--text-muted)">${sc.tag} · ${comp.score}/${comp.total} CIE checks</div></td>
        <td>${formatNumber(m.annualKwh)} kWh</td>
        <td>$${formatNumber(m.annualCost)}</td>
        <td>$${formatNumber(m.totalCapex)}</td>
        <td>${payback}</td>
        <td>${formatNumber(m.modeledRadiance, 1)} nW (${radDrop > 0 ? `-${formatNumber(radDrop, 1)}%` : "0%"})</td>
        <td>${formatNumber(m.zenithSkyMag, 2)} mag/arcsec²</td>
      </tr>
    `;
  });
  tbody.innerHTML = rows.join("");
}

async function handleCitySearch(query) {
  const dropdown = document.getElementById("search-dropdown");
  if (!query || query.trim().length < 2) {
    dropdown.classList.remove("open");
    return;
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`
    );
    const items = await res.json();
    if (!items.length) {
      dropdown.innerHTML = `<div class="search-item"><div class="search-item-title">No municipalities found</div></div>`;
      dropdown.classList.add("open");
      return;
    }
    dropdown.innerHTML = items
      .map(
        (it) => `
      <div class="search-item" data-lon="${it.lon}" data-lat="${it.lat}" data-name="${escapeHtml(it.display_name.split(",")[0])}">
        <div class="search-item-title">${escapeHtml(it.display_name.split(",")[0])}</div>
        <div class="search-item-sub">${escapeHtml(it.display_name)}</div>
      </div>`
      )
      .join("");
    dropdown.classList.add("open");

    dropdown.querySelectorAll(".search-item[data-lon]").forEach((el) => {
      el.addEventListener("click", () => {
        const lon = parseFloat(el.dataset.lon);
        const lat = parseFloat(el.dataset.lat);
        const label = el.dataset.name;
        state.city = {
          id: "custom",
          name: `${label} · Custom Municipal Assessment`,
          country: "International",
          center: [lon, lat],
          zoom: 13.8,
          pitch: 40,
          bearing: 0,
          tariffPerKwh: 0.15,
          baselineViirsRadiance: 28.5,
          naturalSkyMag: 21.95,
          aerosolTau: 0.2,
          description: `Live geocoded municipal corridor centered on ${label} (${lat.toFixed(4)}, ${lon.toFixed(4)}).`,
          fixtures: []
        };
        state.selectedFixture = null;
        state.customTauOverride = null;
        document.getElementById("tau-slider").value = state.city.aerosolTau;
        dropdown.classList.remove("open");
        document.getElementById("search-input").value = label;
        flyToCity(state.city);
        updateTelemetryAndMap();
        showToast(`Loaded international corridor: ${label}`);
      });
    });
  } catch {
    showToast("Geocoding service unavailable offline.");
  }
}

function exportBibtex() {
  const bib = `@article{vilpan2026nightatlas,
  title   = {Building-Aware Urban Lighting and Municipal Lighting Mitigation: A Radiative Transfer Framework},
  author  = {Vilpan, Mark},
  year    = {2026},
  journal = {Night Atlas Technical Preprint},
  note    = {Satellite context from NASA Black Marble VNP46A2/VNP46A4 VIIRS Day/Night Band Radiance}
}`;
  navigator.clipboard?.writeText(bib);
  const blob = new Blob([bib], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "night_atlas_2026.bib";
  a.click();
  showToast("BibTeX copied and downloaded (night_atlas_2026.bib)");
}

document.addEventListener("DOMContentLoaded", () => {
  injectExpansionUI();
  injectResearchTools();

  mapInstance = initMap("map-container", state.city);
  mapInstance.on("load", () => updateTelemetryAndMap());
  mapInstance.on("zoom", () => {
    const z = mapInstance.getZoom();
    const zs = document.getElementById("zoom-slider");
    const zv = document.getElementById("zoom-val");
    if (zs && zv) {
      zs.value = z.toFixed(1);
      zv.textContent = z.toFixed(1);
    }
  });

  let buildingRefreshTimer;
  mapInstance.on("sourcedata", (event) => {
    if (event.sourceId !== "openmap" || !event.isSourceLoaded) return;
    clearTimeout(buildingRefreshTimer);
    buildingRefreshTimer = setTimeout(() => updateTelemetryAndMap(), 150);
  });
  mapInstance.on("moveend", () => {
    if (state.lightsVisible && mapInstance.getZoom() >= 13) {
      updateTelemetryAndMap();
    }
  });

  let draggingFixture = null;
  let dragRaf = null;
  mapInstance.on("mousedown", (e) => {
    if (!state.lightsVisible) return;
    if (state.interactionMode !== "navigate" && state.interactionMode !== "move_light") return;
    const hit = state.city.fixtures.find((f) => {
      const pt = mapInstance.project([f.lon, f.lat]);
      return Math.hypot(pt.x - e.point.x, pt.y - e.point.y) <= 14;
    });
    if (!hit) return;
    commitFixtureEditorInputs();
    e.preventDefault();
    mapInstance.dragPan.disable();
    draggingFixture = hit;
    state.selectedFixture = hit;
    state._justClickedFixture = true;
    mapInstance.getCanvas().style.cursor = "grabbing";
    updateTelemetryAndMap();
  });

  mapInstance.on("mousemove", (e) => {
    if (!draggingFixture) return;
    draggingFixture.lon = Number(e.lngLat.lng.toFixed(6));
    draggingFixture.lat = Number(e.lngLat.lat.toFixed(6));
    if (!dragRaf) {
      dragRaf = requestAnimationFrame(() => {
        dragRaf = null;
        updateTelemetryAndMap();
      });
    }
  });

  mapInstance.on("mouseup", () => {
    if (!draggingFixture) return;
    const movedId = draggingFixture.id;
    draggingFixture = null;
    mapInstance.dragPan.enable();
    mapInstance.getCanvas().style.cursor = state.interactionMode === "navigate" ? "" : "crosshair";
    updateTelemetryAndMap();
    showToast(`Moved ${movedId}`);
  });

  mapInstance.on("click", (e) => {
    if (state._justClickedFixture) {
      state._justClickedFixture = false;
      if (state.interactionMode !== "place_light") return;
    }
    const { lng, lat } = e.lngLat;
    if (state.interactionMode === "place_light") {
      const addCount = Math.max(1, parseInt(document.getElementById("place-count-select")?.value || "1", 10));
      const sc = SCENARIOS[state.scenarioId];
      const baseIdx = Math.max(0, ...state.city.fixtures.map((f) => Number(/^FX-C(\d+)$/.exec(f.id)?.[1]) || 0));
      const newFixtures =
        addCount === 1
          ? [
              {
                id: `FX-C${baseIdx + 1}`,
                lon: Number(lng.toFixed(6)),
                lat: Number(lat.toFixed(6)),
                wattage: 120,
                efficacyLmW: 130,
                heightM: 10,
                cct: sc.cctKelvin,
                ufr: sc.ufr
              }
            ]
          : generateGridFixtures([lng, lat], addCount, sc.cctKelvin, 120, 10).map((f, idx) => ({
              ...f,
              id: `FX-C${baseIdx + idx + 1}`,
              ufr: sc.ufr
            }));
      state.city.fixtures.push(...newFixtures);
      state.selectedFixture = newFixtures[0];
      state.lightsVisible = true;
      const tb = document.getElementById("btn-toggle-lights");
      if (tb) tb.textContent = "Hide Lights";
      updateTelemetryAndMap();
      showToast(`Added ${addCount} light${addCount > 1 ? "s" : ""} at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else if (state.interactionMode === "move_light") {
      if (!state.selectedFixture) {
        showToast("Click a fixture first to select it before moving.");
        return;
      }
      state.selectedFixture.lon = Number(lng.toFixed(6));
      state.selectedFixture.lat = Number(lat.toFixed(6));
      updateTelemetryAndMap();
      showToast(`Moved ${state.selectedFixture.id} to ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else if (state.interactionMode === "draw_zone") {
      state.drawnRing.push([lng, lat]);
      updateTelemetryAndMap();
      showToast(`Zone vertex ${state.drawnRing.length} added`);
    }
  });

  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("city-preset-select").addEventListener("change", (e) => {
    const preset = CITY_PRESETS[e.target.value];
    if (!preset) return;
    state.city = { ...structuredClone(preset), fixtures: [] };
    state.selectedFixture = null;
    state.customTauOverride = null;
    document.getElementById("tau-slider").value = preset.aerosolTau;
    flyToCity(state.city);
    updateTelemetryAndMap();
    showToast(`Switched benchmark to ${preset.name}`);
  });

  document.querySelectorAll(".scenario-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.scenarioId = card.dataset.scenario;
      state.customDimOverride = null;

      document.querySelectorAll(".scenario-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      document.getElementById("dim-slider").value = Math.round(
        computeScenarioMetrics(state.city, SCENARIOS[state.scenarioId], state.localHour).activeDim * 100
      );
      updateTelemetryAndMap();
    });
  });

  document.getElementById("btn-toggle-lights")?.addEventListener("click", (e) => {
    state.lightsVisible = !state.lightsVisible;
    e.currentTarget.textContent = state.lightsVisible ? "Hide Lights" : "Show Lights";
    updateTelemetryAndMap();
  });

  document.getElementById("btn-clear-lights")?.addEventListener("click", () => {
    state.city.fixtures = [];
    state.selectedFixture = null;
    updateTelemetryAndMap();
    showToast("Cleared all lights from map");
  });

  document.getElementById("btn-clear-drawn")?.addEventListener("click", () => {
    state.drawnRing = [];
    setQgisGeoJson(null);
    updateTelemetryAndMap();
    showToast("Cleared drawn zone");
  });

  const setInteractionMode = (mode) => {
    state.interactionMode = mode;
    document.querySelectorAll(".mode-btn").forEach((b) => {
      const isMatch = b.dataset.mode === mode;
      b.classList.toggle("active", isMatch);
      if (b.id === "btn-quick-place") b.classList.toggle("btn-primary", isMatch);
    });
    mapInstance.getCanvas().style.cursor = mode === "navigate" ? "" : "crosshair";
  };

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetMode = btn.dataset.mode;
      if (btn.id === "btn-quick-place" && state.interactionMode === "place_light") {
        setInteractionMode("navigate");
        return;
      }
      setInteractionMode(targetMode);
    });
  });

  const bindFixtureField = (id, applyFn) => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = (e) => {
      if (!state.selectedFixture) return;
      if (applyFn(state.selectedFixture, e.target.value)) {
        updateTelemetryAndMap();
      }
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  };

  bindFixtureField("fx-edit-watt", (fx, raw) => {
    const val = parseFloat(raw);
    if (!Number.isFinite(val) || val <= 0) return false;
    fx.wattage = val;
    return true;
  });

  bindFixtureField("fx-edit-height", (fx, raw) => {
    const val = parseFloat(raw);
    if (!Number.isFinite(val) || val <= 0) return false;
    fx.heightM = val;
    return true;
  });

  bindFixtureField("fx-edit-cct", (fx, raw) => {
    const val = parseInt(raw, 10);
    if (!Number.isFinite(val)) return false;
    fx.cct = val;
    return true;
  });

  bindFixtureField("fx-edit-ufr", (fx, raw) => {
    const val = parseFloat(raw);
    if (!Number.isFinite(val) || val < 0) return false;
    fx.ufr = Math.min(1, val);
    return true;
  });

  document.getElementById("btn-fx-move")?.addEventListener("click", () => {
    if (!state.selectedFixture) return;
    setInteractionMode("move_light");
    showToast(`Click anywhere on the map to relocate ${state.selectedFixture.id}`);
  });

  document.getElementById("btn-fx-retrofit")?.addEventListener("click", () => {
    if (!state.selectedFixture) return;
    state.selectedFixture.cct = 2700;
    state.selectedFixture.ufr = 0.01;
    state.selectedFixture.wattage = Math.max(40, Math.round((state.selectedFixture.wattage || 120) * 0.7));
    updateTelemetryAndMap();
    showToast(`Retrofitted ${state.selectedFixture.id} to 2700K Full-Cutoff`);
  });

  document.getElementById("btn-fx-delete")?.addEventListener("click", () => {
    if (!state.selectedFixture) return;
    const removedId = state.selectedFixture.id;
    state.city.fixtures = state.city.fixtures.filter((f) => f.id !== removedId);
    state.selectedFixture = null;
    updateTelemetryAndMap();
    showToast(`Deleted ${removedId}`);
  });

  document.getElementById("viirs-baseline-slider")?.addEventListener("input", (e) => {
    state.city.baselineViirsRadiance = parseFloat(e.target.value);
    updateTelemetryAndMap();
  });

  document.getElementById("zoom-slider").addEventListener("input", (e) => {
    const z = parseFloat(e.target.value);
    document.getElementById("zoom-val").textContent = z.toFixed(1);
    mapInstance.easeTo({ zoom: z, duration: 120 });
  });

  document.getElementById("viirs-epoch-select").addEventListener("change", (e) => {
    const epoch = e.target.value;
    const layerDate = epoch === "2012" ? "2012-01-01" : epoch === "daily" ? "2026-11-10" : "2016-01-01";
    const layerName =
      epoch === "daily" ? "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance" : "VIIRS_Black_Marble";
    const src = mapInstance.getSource("viirs");
    if (src) {
      src.setTiles([
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerName}/default/${layerDate}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`
      ]);
      showToast(`Switched NASA VIIRS layer to ${epoch}`);
    }
  });

  document.getElementById("hour-slider").addEventListener("input", (e) => {
    state.localHour = parseInt(e.target.value, 10);
    updateTelemetryAndMap();
  });

  document.getElementById("dim-slider").addEventListener("input", (e) => {
    state.customDimOverride = parseInt(e.target.value, 10) / 100;
    updateTelemetryAndMap();
  });

  document.getElementById("tau-slider").addEventListener("input", (e) => {
    state.customTauOverride = parseFloat(e.target.value);
    updateTelemetryAndMap();
  });

  document.getElementById("albedo-slider")?.addEventListener("input", (e) => {
    state.city.surfaceAlbedo = parseFloat(e.target.value);
    updateTelemetryAndMap();
  });

  document.getElementById("qgis-geojson-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const geojson = JSON.parse(await file.text());
      const summary = summarizeGeoJson(geojson);
      setQgisGeoJson(geojson);
      document.getElementById("qgis-status").textContent = `${summary.featureCount} feature(s) active`;
      if (summary.centroid) {
        flyToCity({ center: summary.centroid, zoom: 14.0, pitch: 40, bearing: 0 });
      }
      updateTelemetryAndMap();
      showToast(`Loaded QGIS GeoJSON (${summary.featureCount} features)`);
    } catch {
      showToast("Invalid GeoJSON file.");
    }
  });

  document.querySelectorAll(".basemap-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".basemap-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setBasemap(btn.dataset.basemap);
    });
  });

  const viirsBtn = document.getElementById("btn-viirs-toggle");
  viirsBtn.addEventListener("click", () => {
    state.viirsOn = !state.viirsOn;
    viirsBtn.classList.toggle("viirs-on", state.viirsOn);
    toggleViirsOverlay(state.viirsOn);
  });

  let searchTimer = null;
  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => handleCitySearch(e.target.value), 350);
  });

  document.getElementById("toast-close").addEventListener("click", () => {
    document.getElementById("toast").classList.remove("show");
  });

  document.getElementById("baci-file-input")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).slice(1);
    const baci = { tBefore: [], tAfter: [], cBefore: [], cAfter: [] };
    for (const line of lines) {
      const cols = line.split(",").map((s) => s.trim().toLowerCase());
      if (cols.length < 3) continue;
      const val = parseFloat(cols[2]);
      if (!Number.isFinite(val)) continue;
      if (cols[0].startsWith("t") && cols[1].startsWith("b")) baci.tBefore.push(val);
      else if (cols[0].startsWith("t") && cols[1].startsWith("a")) baci.tAfter.push(val);
      else if (cols[0].startsWith("c") && cols[1].startsWith("b")) baci.cBefore.push(val);
      else if (cols[0].startsWith("c") && cols[1].startsWith("a")) baci.cAfter.push(val);
    }
    if (Object.values(baci).every((group) => group.length >= 2)) {
      state.uploadedBaci = baci;
      renderCalibrationAndBaci(state.uploadedSqmPairs ?? SAMPLE_SQM_PAIRS);
      renderLatex();
      showToast("Loaded custom BACI dataset");
    } else {
      showToast("CSV needs at least two finite radiance observations in each treatment/control before/after group.");
    }
  });

  document.getElementById("sqm-file-input")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).slice(1);
    const parsed = lines
      .map((l) => l.split(","))
      .filter((c) => c.length >= 6)
      .map((c) => ({ id: c[0], observed: parseFloat(c[4]), modeled: parseFloat(c[5]) }))
      .filter((p) => Number.isFinite(p.observed) && Number.isFinite(p.modeled));
    if (parsed.length) {
      state.uploadedSqmPairs = parsed;
      renderCalibrationAndBaci(parsed);
      renderLatex();
      showToast(`Loaded ${parsed.length} SQM calibration stations`);
    }
  });

  document.getElementById("btn-export-sqm-svg")?.addEventListener("click", () => {
    const svg = document.getElementById("sqm-svg")?.outerHTML;
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sqm_calibration.svg";
    a.click();
    showToast("Exported sqm_calibration.svg");
  });

  document.getElementById("inv-file-input")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).slice(1);
    const parsed = lines
      .map((l) => l.split(","))
      .filter((c) => c.length >= 7)
      .map((c) => ({
        id: c[0],
        lat: parseFloat(c[1]),
        lon: parseFloat(c[2]),
        wattage: parseFloat(c[3]),
        cct: parseFloat(c[4]),
        ufr: parseFloat(c[5]),
        heightM: parseFloat(c[6])
      }));
    if (parsed.some((f) => ![f.lat, f.lon, f.wattage, f.cct, f.ufr, f.heightM].every(Number.isFinite) || Math.abs(f.lat) > 90 || Math.abs(f.lon) > 180 || f.wattage <= 0 || f.cct <= 0 || f.heightM <= 0 || f.ufr < 0 || f.ufr > 1)) {
      showToast("Inventory rejected: check coordinates and numeric fixture specifications.");
      return;
    }
    if (parsed.length) {
      state.uploadedInventory = parsed;
      renderMunicipalAudit(parsed);
      showToast(`Audited ${parsed.length} municipal fixtures`);
    }
  });

  document.getElementById("btn-export-audit-csv")?.addEventListener("click", () => {
    const rows = window._lastAuditRows || [];
    const header = "id,lat,lon,wattage,cct,ufr,compliant,capex_usd,annual_kwh_saved,priority_score\n";
    const body = rows
      .map(
        (r) =>
          `${r.id},${r.lat},${r.lon},${r.wattage},${r.cct},${r.ufr},${r.compliant},${r.capex},${r.annualKwhSaved.toFixed(1)},${r.priorityScore.toFixed(3)}`
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "night_atlas_retrofit_priority.csv";
    a.click();
    showToast("Exported night_atlas_retrofit_priority.csv");
  });

  document.getElementById("btn-export-bib")?.addEventListener("click", exportBibtex);
  document.getElementById("btn-print-paper")?.addEventListener("click", () => window.print());
  document.getElementById("btn-topbar-paper")?.addEventListener("click", () => switchView("research"));

  injectWelcomeScreen();
  renderLatex();
});

function injectWelcomeScreen() {
  const overlay = document.createElement("div");
  overlay.id = "welcome-overlay";
  overlay.className = "welcome-overlay";
  if (sessionStorage.getItem("nightAtlasWelcomeDismissed") === "1") {
    overlay.classList.add("hidden");
    overlay.inert = true;
  }
  overlay.innerHTML = `
    <div class="welcome-panel">
      <div class="hero-eyebrow">Night Atlas · International Skyglow Lab</div>
      <h1 class="welcome-title">See the night. Quantify the sky.</h1>
      <p class="welcome-sub">
        A building-aware urban lighting simulation. Explore how geometry, lamp height, shielding, and dimming affect predicted illumination. Field validation is the next research step.
      </p>
      <div class="welcome-grid">
        <button class="welcome-tile" data-launch="atlas">
          <div class="welcome-tile-title">01 Explore 3D Atlas</div>
          <div class="welcome-tile-desc">Switch international benchmarks, toggle NASA VIIRS, or drop in QGIS GeoJSON layers.</div>
        </button>
        <button class="welcome-tile" data-launch="calibration">
          <div class="welcome-tile-title">02 Calibration &amp; BACI</div>
          <div class="welcome-tile-desc">Validate modeled $\\mu_z$ against SQM readings and run BACI statistical tests.</div>
        </button>
        <button class="welcome-tile" data-launch="research">
          <div class="welcome-tile-title">03 Research Paper</div>
          <div class="welcome-tile-desc">Inspect KaTeX equations, export BibTeX, or print a publication-ready PDF.</div>
        </button>
      </div>
      <button class="btn btn-primary" id="btn-enter-atlas" style="padding:10px 24px;font-size:14px;">
        Enter Atlas &amp; Simulation
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  const dismiss = (targetView = null) => {
    sessionStorage.setItem("nightAtlasWelcomeDismissed", "1");
    overlay.classList.add("hidden");
    overlay.inert = true;
    if (targetView) switchView(targetView);
  };

  document.getElementById("btn-enter-atlas").addEventListener("click", () => dismiss("atlas"));
  overlay.querySelectorAll(".welcome-tile").forEach((tile) => {
    tile.addEventListener("click", () => dismiss(tile.dataset.launch));
  });
  document.querySelector(".brand")?.addEventListener("click", () => {
    overlay.classList.remove("hidden");
    overlay.inert = false;
  });
}


function injectResearchTools() {
  const card = document.createElement("div");
  card.className = "research-summary";
  card.innerHTML = `<span class="badge badge-fail">Simulation · not field validated</span>
    <h3>Research question</h3>
    <p>How does including surrounding buildings change predicted street-level illumination?</p>
    <details><summary>Hypothesis &amp; method</summary><p>Hypothesis: ignoring buildings overestimates illumination in obstructed areas. Compare the same fixture with and without buildings, holding lamp settings constant. Vary height, shielding, and dimming. Evaluate mean lux, shadowed area, and upward escape; energy use is unchanged by geometry alone.</p><p>These are model comparisons. Field measurements are required to establish accuracy.</p></details>`;
  document.querySelector('.dock-left').prepend(card);
  const panel = document.createElement('details');
  panel.className = 'research-summary';
  panel.innerHTML = `<summary>Building Effect experiment</summary><p>Compares the selected fixture, or the first placed light.</p><button class="btn" id="run-building-experiment">Run comparison</button><div id="building-experiment-result" aria-live="polite"></div>`;
  document.querySelector('.dock-right').prepend(panel);
  document.getElementById('run-building-experiment').addEventListener('click', () => {
    panel.dataset.hasRun = 'true';
    updateTelemetryAndMap();
  });
  const status = document.createElement('p');
  status.className = 'model-status';
  status.textContent = 'Simulation outputs · Fixture settings and environmental parameters are assumed/user-entered. NASA imagery is satellite context. No measured inputs are connected to this simulation.';
  document.querySelector('.dock-right').prepend(status);
}

function renderBuildingExperiment(activeDim) {
  const target = document.getElementById('building-experiment-result');
  if (!target || target.parentElement.dataset.hasRun !== 'true') return;
  const fixture = state.selectedFixture || state.city.fixtures[0];
  if (!fixture) {
    target.textContent = 'Place a light on the map, then run the comparison.';
    return;
  }
  const open = traceFixture3D(effectiveFixture(fixture, SCENARIOS[state.scenarioId]), [], activeDim, state.city.surfaceAlbedo ?? 0.14, 0.25);
  const built = fixture.rayTrace;
  if (!built) { target.textContent = 'Building geometry is loading. Run again when the map has loaded.'; return; }
  const rows = [
    ['Mean ground lux', open.meanGroundLux, built.meanGroundLux, ' lx'],
    ['Shadowed samples', open.shadowedFraction * 100, built.shadowedFraction * 100, '%'],
    ['Direct upward escape', open.directEscapeFactor * 100, built.directEscapeFactor * 100, '%']
  ];
  target.innerHTML = `<p><strong>${escapeHtml(fixture.id)}</strong> · identical fixture and dimming</p><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Metric</th><th>Open</th><th>Buildings</th><th>Change</th></tr></thead><tbody>${rows.map(([name,a,b,unit]) => `<tr><td>${name}</td><td>${formatNumber(a,1)}${unit}</td><td>${formatNumber(b,1)}${unit}</td><td>${b-a>=0?'+':''}${formatNumber(b-a,1)}${unit === '%' ? ' pp' : unit}</td></tr>`).join('')}</tbody></table></div><p>Shadow fraction counts sampled ground cells, not area-weighted coverage. Building results depend on loaded map geometry. Equal results can mean no obstruction or missing building data. This comparison does not establish real-world accuracy.</p>`;
}
