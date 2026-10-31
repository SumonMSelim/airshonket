#!/usr/bin/env python3
"""Build the latest PM2.5 GeoJSON that the map reads.

Reads recent daily measurement files for each Bangladesh station from the
public OpenAQ archive on Amazon S3 (no AWS account needed), takes the most
recent PM2.5 value per station, and writes a small GeoJSON FeatureCollection.

This is the local/dev version of the ingest. The scheduled AWS Lambda uses the
same logic. The map serves the output as a static file through CloudFront.

Input:  data/bd_stations.json   (from fetch_bd_stations.py)
Output: data/latest_pm25.geojson

Usage:
    python3 build_latest_pm25.py [--days 3]
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import io
import json
import subprocess
import sys
from pathlib import Path

BUCKET = "openaq-data-archive"
# PM2.5 only. The archive stores the parameter name in each row.
PM25_PARAM = "pm25"


def s3_cp(key: str) -> bytes | None:
    """Download one object from the public bucket to memory. None if missing."""
    uri = f"s3://{BUCKET}/{key}"
    try:
        out = subprocess.run(
            ["aws", "s3", "cp", "--no-sign-request", "--region", "us-east-1", uri, "-"],
            capture_output=True,
            check=True,
        )
        return out.stdout
    except subprocess.CalledProcessError:
        return None


def latest_pm25_for_station(location_id: int, days: int) -> tuple[float, str] | None:
    """Return (value, datetime_iso) for the most recent valid PM2.5 reading.

    Walks back up to ``days`` days of daily files for this location. Files are
    written ~72h after each day, so we start a few days back. Rows with
    non-physical PM2.5 values (negative, or above a sanity ceiling) are
    ignored, since low-cost sensors occasionally report garbage.
    """
    # Physical sanity bounds for PM2.5 in ug/m3. Readings outside are dropped.
    MIN_PM25 = 0.0
    MAX_PM25 = 1000.0

    today = dt.date.today()
    # Start 2 days back because today's file will not exist yet.
    for offset in range(2, 2 + days):
        day = today - dt.timedelta(days=offset)
        key = (
            f"records/csv.gz/locationid={location_id}/"
            f"year={day:%Y}/month={day:%m}/"
            f"location-{location_id}-{day:%Y%m%d}.csv.gz"
        )
        blob = s3_cp(key)
        if not blob:
            continue
        try:
            text = gzip.decompress(blob).decode("utf-8")
        except OSError:
            continue

        best_val = None
        best_dt = None
        for row in csv.DictReader(io.StringIO(text)):
            if row.get("parameter") != PM25_PARAM:
                continue
            try:
                val = float(row["value"])
            except (KeyError, ValueError):
                continue
            if not (MIN_PM25 <= val <= MAX_PM25):
                continue
            when = row.get("datetime", "")
            if best_dt is None or when > best_dt:
                best_dt = when
                best_val = val
        if best_val is not None:
            return best_val, best_dt
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=5, help="days back to search")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    stations_path = root / "data" / "bd_stations.json"
    out_path = root / "data" / "latest_pm25.geojson"

    if not stations_path.exists():
        print(f"ERROR: {stations_path} not found. Run fetch_bd_stations.py first.",
              file=sys.stderr)
        return 1

    stations = json.loads(stations_path.read_text())["stations"]
    print(f"Reading recent PM2.5 for {len(stations)} stations from S3 ...",
          file=sys.stderr)

    features = []
    found = 0
    for s in stations:
        loc_id = s["location_id"]
        result = latest_pm25_for_station(loc_id, args.days)
        if result is None:
            continue
        value, when = result
        found += 1
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [s["lon"], s["lat"]]},
                "properties": {
                    "name": s.get("name") or f"Station {loc_id}",
                    "location_id": loc_id,
                    "pm25": round(value, 1),
                    "datetime": when,
                    "provider": s.get("provider"),
                },
            }
        )
        print(f"  {loc_id}: {value:.1f} ug/m3 at {when}", file=sys.stderr)

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenAQ public archive on Amazon S3",
            "parameter": "pm25",
            "unit": "ug/m3",
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "station_count": found,
            "note": "Most recent available reading per station.",
        },
        "features": features,
    }
    out_path.write_text(json.dumps(fc), encoding="utf-8")
    print(f"Wrote {found} station readings to {out_path}", file=sys.stderr)
    return 0 if found else 2


if __name__ == "__main__":
    raise SystemExit(main())
