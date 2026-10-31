"""AirShonket ingest Lambda.

Runs on a schedule (Amazon EventBridge). For each Bangladesh station it reads
the most recent valid PM2.5 reading from the OpenAQ public archive on Amazon
S3, then writes two things to our own S3 bucket:

  1. latest_pm25.geojson:  the small file the map reads (served via CloudFront)
  2. snapshots/dt=<date>/latest_pm25_<ts>.json: an append-only history record
     that the Iceberg table / Athena read for trends.

Environment variables:
  DATA_BUCKET      our S3 bucket for site data (required)
  STATIONS_KEY     key of the station list JSON in DATA_BUCKET
                   (default: data/bd_stations.json)
  LATEST_KEY       key to write the latest GeoJSON
                   (default: data/latest_pm25.geojson)
  SNAPSHOT_PREFIX  prefix for history snapshots (default: snapshots)
  DAYS_BACK        how many days to search for a recent reading (default: 5)

The OpenAQ archive bucket is public and read with an unsigned client, so the
Lambda's execution role only needs access to DATA_BUCKET.
"""

from __future__ import annotations

import csv
import datetime as dt
import gzip
import io
import json
import os

import boto3
from botocore import UNSIGNED
from botocore.client import Config

OPENAQ_BUCKET = "openaq-data-archive"
PM25_PARAM = "pm25"
MIN_PM25 = 0.0
MAX_PM25 = 1000.0

# Signed client for our own bucket; unsigned client for the public OpenAQ bucket.
_s3 = boto3.client("s3")
_s3_public = boto3.client("s3", config=Config(signature_version=UNSIGNED))


def _read_openaq_day(location_id: int, day: dt.date) -> bytes | None:
    key = (
        f"records/csv.gz/locationid={location_id}/"
        f"year={day:%Y}/month={day:%m}/"
        f"location-{location_id}-{day:%Y%m%d}.csv.gz"
    )
    try:
        obj = _s3_public.get_object(Bucket=OPENAQ_BUCKET, Key=key)
        return obj["Body"].read()
    except _s3_public.exceptions.NoSuchKey:
        return None
    except Exception:
        return None


def latest_pm25_for_station(location_id: int, days: int):
    """Return (value, datetime_iso) for the most recent valid PM2.5 reading."""
    today = dt.date.today()
    for offset in range(2, 2 + days):  # today's file is not written yet
        blob = _read_openaq_day(location_id, today - dt.timedelta(days=offset))
        if not blob:
            continue
        try:
            text = gzip.decompress(blob).decode("utf-8")
        except OSError:
            continue

        best_val = best_dt = None
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
                best_dt, best_val = when, val
        if best_val is not None:
            return best_val, best_dt
    return None


def _load_stations(bucket: str, key: str) -> list[dict]:
    obj = _s3.get_object(Bucket=bucket, Key=key)
    return json.loads(obj["Body"].read())["stations"]


def handler(event, context):
    bucket = os.environ["DATA_BUCKET"]
    stations_key = os.environ.get("STATIONS_KEY", "data/bd_stations.json")
    latest_key = os.environ.get("LATEST_KEY", "data/latest_pm25.geojson")
    snapshot_prefix = os.environ.get("SNAPSHOT_PREFIX", "snapshots")
    days_back = int(os.environ.get("DAYS_BACK", "5"))

    stations = _load_stations(bucket, stations_key)

    features = []
    rows = []  # flat records for the history snapshot / Iceberg
    now = dt.datetime.now(dt.timezone.utc)

    for s in stations:
        loc_id = s["location_id"]
        result = latest_pm25_for_station(loc_id, days_back)
        if result is None:
            continue
        value, when = result
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
        rows.append(
            {
                "location_id": loc_id,
                "name": s.get("name"),
                "lat": s["lat"],
                "lon": s["lon"],
                "pm25": round(value, 1),
                "reading_time": when,
                "ingested_at": now.isoformat(),
            }
        )

    # 1. Latest GeoJSON for the map.
    latest = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenAQ public archive on Amazon S3",
            "parameter": "pm25",
            "unit": "ug/m3",
            "generated_at": now.isoformat(),
            "station_count": len(features),
        },
        "features": features,
    }
    _s3.put_object(
        Bucket=bucket,
        Key=latest_key,
        Body=json.dumps(latest).encode("utf-8"),
        ContentType="application/geo+json",
        CacheControl="public, max-age=300",
    )

    # 2. History snapshot: newline-delimited JSON, partitioned by date, for
    #    the Iceberg table / Athena. One object per run.
    snap_key = (
        f"{snapshot_prefix}/dt={now:%Y-%m-%d}/"
        f"pm25_{now:%Y%m%dT%H%M%S}.json"
    )
    ndjson = "\n".join(json.dumps(r) for r in rows)
    _s3.put_object(
        Bucket=bucket,
        Key=snap_key,
        Body=ndjson.encode("utf-8"),
        ContentType="application/x-ndjson",
    )

    return {
        "stations_total": len(stations),
        "readings_written": len(features),
        "latest_key": latest_key,
        "snapshot_key": snap_key,
    }
