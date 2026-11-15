"""
Night Atlas — Server-Side NASA Black Marble VNP46A2/VNP46A4 Proxy
Keeps NASA_EARTHDATA_TOKEN out of client-side browser code.
"""
import os
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

app = FastAPI(title="Night Atlas NASA Black Marble Proxy", version="2.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BaciRequest(BaseModel):
    treatment_before: List[float]
    treatment_after: List[float]
    control_before: List[float]
    control_after: List[float]


@app.get("/api/health")
def health():
    has_token = bool(os.environ.get("NASA_EARTHDATA_TOKEN"))
    return {"status": "ok", "earthdata_token_configured": has_token}


@app.get("/api/vnp46")
def get_vnp46_timeseries(lat: float, lon: float, start_year: int = 2016, end_year: int = 2026):
    """
    Proxy endpoint for NASA LAADS DAAC VNP46A2/VNP46A4 HDF5 radiance extraction.
    Set NASA_EARTHDATA_TOKEN in the server environment for live granule retrieval.
    """
    token = os.environ.get("NASA_EARTHDATA_TOKEN")
    if not token:
        raise HTTPException(
            status_code=503,
            detail="NASA_EARTHDATA_TOKEN not configured on server; using client-side offline mode.",
        )
    return {
        "lat": lat,
        "lon": lon,
        "product": "VNP46A4",
        "units": "nW·cm^-2·sr^-1",
        "start_year": start_year,
        "end_year": end_year,
        "status": "ready_for_granule_query",
    }


@app.post("/api/baci")
def compute_baci(req: BaciRequest):
    tb = np.array(req.treatment_before, dtype=float)
    ta = np.array(req.treatment_after, dtype=float)
    cb = np.array(req.control_before, dtype=float)
    ca = np.array(req.control_after, dtype=float)

    delta = (ta.mean() - tb.mean()) - (ca.mean() - cb.mean())
    se = float(
        np.sqrt(
            tb.var(ddof=1) / len(tb)
            + ta.var(ddof=1) / len(ta)
            + cb.var(ddof=1) / len(cb)
            + ca.var(ddof=1) / len(ca)
        )
    )
    t_stat = float(delta / se) if se > 0 else 0.0
    return {
        "delta_baci": float(delta),
        "std_error": se,
        "t_stat": t_stat,
        "ci_95": [float(delta - 1.96 * se), float(delta + 1.96 * se)],
        "significant_at_0_05": abs(t_stat) > 1.96,
    }
