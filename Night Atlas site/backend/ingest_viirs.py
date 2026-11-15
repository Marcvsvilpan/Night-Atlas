"""
Night Atlas — NASA Black Marble (VNP46A2 / VNP46A4) HDF5 Ingestion CLI
Extracts quality-filtered upward radiance [nW·cm^-2·sr^-1] from .h5 granules.

Usage:
    python3 ingest_viirs.py --input VNP46A4.A2025001.h21v03.h5 --output viirs_series.csv
"""
import argparse
import csv
import h5py
import numpy as np


def extract_vnp46_radiance(h5_path: str, dataset_name: str = "AllAngle_Composite_Snow_Free"):
    with h5py.File(h5_path, "r") as f:
        grids = f["HDFEOS"]["GRIDS"]["VNP_Grid_DNB"]["Data Fields"]
        if dataset_name not in grids:
            available = list(grids.keys())
            raise KeyError(f"Dataset '{dataset_name}' not found. Available: {available}")

        raw = grids[dataset_name][...].astype(np.float64)
        fill_val = grids[dataset_name].attrs.get("_FillValue", 65535)
        scale = float(grids[dataset_name].attrs.get("scale_factor", 0.1))

        valid_mask = (raw != fill_val) & (raw >= 0)
        if "Mandatory_Quality_Flag" in grids:
            qf = grids["Mandatory_Quality_Flag"][...]
            valid_mask &= qf <= 1  # High/medium quality retrievals only

        radiance_nw = raw[valid_mask] * scale
        return {
            "mean_radiance_nw": float(np.mean(radiance_nw)) if radiance_nw.size else 0.0,
            "median_radiance_nw": float(np.median(radiance_nw)) if radiance_nw.size else 0.0,
            "pixel_count": int(radiance_nw.size),
            "valid_fraction": float(np.mean(valid_mask)),
        }


def main():
    parser = argparse.ArgumentParser(description="Extract NASA Black Marble VNP46 radiance.")
    parser.add_argument("--input", required=True, help="Path to VNP46A2/VNP46A4 .h5 file")
    parser.add_argument("--output", default="viirs_summary.csv", help="Output CSV path")
    parser.add_argument(
        "--dataset",
        default="AllAngle_Composite_Snow_Free",
        help="HDF5 Data Field name",
    )
    args = parser.parse_args()

    stats = extract_vnp46_radiance(args.input, args.dataset)
    with open(args.output, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(stats.keys()))
        writer.writeheader()
        writer.writerow(stats)
    print(f"Wrote {args.output}: {stats}")


if __name__ == "__main__":
    main()
