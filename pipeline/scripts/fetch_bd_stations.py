#!/usr/bin/env python3
"""Fetch the list of Bangladesh air quality stations from the OpenAQ API.

This is a one-time lookup. The OpenAQ S3 archive is keyed by numeric location
id with no country index, so we use the OpenAQ v3 API once to learn which
location ids belong to Bangladesh. The result is cached to
``data/bd_stations.json`` and then the pipeline reads measurements from S3.

The v3 API needs a free API key. Get one at https://explore.openaq.org
(create an account, then copy the key). Pass it in the environment:

    export OPENAQ_API_KEY=your_key_here
    python3 fetch_bd_stations.py

Data source: OpenAQ.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_BASE = "https://api.openaq.org/v3"
BANGLADESH_ISO = "BD"
PAGE_LIMIT = 1000


def _get(path: str, params: dict, api_key: str) -> dict:
    url = f"{API_BASE}{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={"X-API-Key": api_key, "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_stations(api_key: str) -> list[dict]:
    """Return Bangladesh locations that measure PM2.5, with coordinates."""
    stations: list[dict] = []
    page = 1
    while True:
        data = _get(
            "/locations",
            {
                "iso": BANGLADESH_ISO,
                "limit": PAGE_LIMIT,
                "page": page,
                "parameters_id": 2,  # 2 = pm25 in OpenAQ
            },
            api_key,
        )
        results = data.get("results", [])
        for loc in results:
            coords = loc.get("coordinates") or {}
            lat, lon = coords.get("latitude"), coords.get("longitude")
            if lat is None or lon is None:
                continue
            sensor_ids = []
            for s in loc.get("sensors", []) or []:
                param = s.get("parameter") or {}
                # Match PM2.5 by name or numeric id, whichever the API returns.
                if param.get("name") == "pm25" or param.get("id") == 2:
                    sensor_ids.append(s.get("id"))
            stations.append(
                {
                    "location_id": loc.get("id"),
                    "name": loc.get("name"),
                    "lat": lat,
                    "lon": lon,
                    "pm25_sensor_ids": sensor_ids,
                    "provider": (loc.get("provider") or {}).get("name"),
                }
            )
        if len(results) < PAGE_LIMIT:
            break
        page += 1
        time.sleep(1)  # be polite to the API
    return stations


def main() -> int:
    api_key = os.environ.get("OPENAQ_API_KEY", "").strip()
    if not api_key:
        print(
            "ERROR: OPENAQ_API_KEY is not set.\n"
            "Get a free key at https://explore.openaq.org, then run:\n"
            "    export OPENAQ_API_KEY=your_key_here\n"
            "    python3 fetch_bd_stations.py",
            file=sys.stderr,
        )
        return 2

    out = Path(__file__).resolve().parents[2] / "data" / "bd_stations.json"
    print("Fetching Bangladesh PM2.5 stations from OpenAQ ...", file=sys.stderr)
    try:
        stations = fetch_stations(api_key)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            print("ERROR: the OpenAQ API rejected the key (HTTP "
                  f"{exc.code}). Check OPENAQ_API_KEY.", file=sys.stderr)
            return 2
        raise

    if not stations:
        print("WARNING: no PM2.5 stations returned for Bangladesh.", file=sys.stderr)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "source": "OpenAQ v3 API",
                "country": BANGLADESH_ISO,
                "parameter": "pm25",
                "station_count": len(stations),
                "stations": stations,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(stations)} stations to {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
