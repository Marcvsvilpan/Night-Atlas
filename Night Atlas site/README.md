# Night Atlas — Building-Aware Urban Lighting Simulation

Night Atlas explores how building geometry, fixture height, shielding, and dimming affect simulated street-level illumination. It is a research prototype; physical accuracy has not yet been established through field measurements.

## Research question

How does including surrounding buildings change predicted street-level illumination?

Hypothesis: an unobstructed model overestimates illumination in obstructed areas. The Building Effect experiment compares a single fixture with and without surrounding geometry while keeping fixture properties and dimming identical. It reports mean ground lux, the fraction of shadowed samples, and direct upward escape. It is a model comparison, not empirical validation.

## Try the experiment

1. Run `python3 -m http.server 8765` from this folder.
2. Open http://localhost:8765 and enter the Atlas.
3. Choose a location, zoom in, and allow building tiles to load.
4. Use **Place Light**, then select the fixture.
5. Open **Building Effect experiment** and click **Run comparison**.
6. Change height, shielding, or dimming and inspect the updated comparison.

Run `npm test` for calculation and geometry regression checks.

## What the prototype implements

- Interactive fixture placement and editing using MapLibre and deck.gl.
- Approximate directional photometry, ground sampling, and building intersection tests.
- Energy estimates, mitigation scenarios, and demonstration data-analysis panels.
- A controlled comparison of open-space and building-aware predictions.

## Evidence and limitations

- Fixture specifications and environmental inputs are assumed or user-entered unless independently documented.
- Building footprints/heights come from map tiles and can be incomplete or change as more detailed tiles load.
- NASA imagery provides satellite context; it does not calibrate street-level lux or validate skyglow predictions.
- Lamp photometry uses an approximation, not measured manufacturer IES/LDT distributions.
- Reflection and skyglow parameters are exploratory assumptions.
- Shadowed sample fraction is not an area-weighted shadow fraction.
- Scenario check badges are illustrative thresholds, not certification of lighting safety or standards compliance.
- Existing SQM/BACI demonstration data are not validation of the lighting model.

## Next validation step

Document a real fixture and collect repeated ground illuminance measurements at fixed locations. Compare both model variants on observations not used to tune parameters. Report errors, measurement conditions, and uncertainty even if building geometry does not improve agreement.

## Contributions and dependencies

This repository contains the Night Atlas project attributed to Mark Vilpan. Development and debugging have included AI assistance. Before using it in an application, add a factual contribution statement describing which research decisions, measurements, analysis, and implementation you personally completed, and any mentor contributions. Do not describe third-party mapping engines as original work.

Mapping: MapLibre GL JS, deck.gl, OpenFreeMap/OpenMapTiles, OpenStreetMap and Esri. Satellite context: NASA GIBS. Equations: KaTeX. Preserve data-provider attribution and consult each source's terms for reuse.

The optional Python backend is separate from the static demonstration. Live NASA granule retrieval is not implemented; the included ingestion utility processes local HDF5 files and needs product/version-specific quality review before research use.
