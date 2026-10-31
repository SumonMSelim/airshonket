#!/usr/bin/env python3
"""Fetch brick kiln locations in Bangladesh from OpenStreetMap.

Uses the Overpass API. Writes a small GeoJSON FeatureCollection to
``data/kilns.geojson``. This is a one-time pull. The output is static and is
uploaded to S3 once, then served to the map through CloudFront.

Data source: OpenStreetMap, licensed under ODbL.
Attribution: (c) OpenStreetMap contributors.

Usage:
    python3 fetch_osm_kilns.py [--out PATH]
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# Identify ourselves. Overpass blocks requests with no user agent (HTTP 406).
USER_AGENT = "AirShonket/1.0 (AWS Map It hackathon; brick kiln map of Bangladesh)"

# Brick kilns are tagged several ways in OSM. We take the union of the common
# tag combinations, restricted to the Bangladesh national boundary.
OVERPASS_QUERY = """
[out:json][timeout:120];
area["ISO3166-1"="BD"][admin_level=2]->.bd;
(
  nwr["man_made"="kiln"](area.bd);
  nwr["product"~"brick",i](area.bd);
  nwr["craft"="brickworks"](area.bd);
  nwr["landuse"="industrial"]["industrial"~"brick",i](area.bd);
);
out center;
"""

# Rough Bangladesh bounding box, used only to drop obviously bad coordinates.
BD_LAT_MIN, BD_LAT_MAX = 20.0, 27.0
BD_LON_MIN, BD_LON_MAX = 87.5, 93.0


def fetch_raw() -> dict:
    """Call Overpass and return the parsed JSON response.

    Tries each mirror in turn. Overpass nodes return transient 502/504 errors
    under load, so a mirror fallback makes the one-time pull reliable.
    """
    body = urllib.parse.urlencode({"data": OVERPASS_QUERY}).encode("ascii")
    last_error: Exception | None = None
    for url in OVERPASS_URLS:
        for attempt in range(1, 4):
            try:
                req = urllib.request.Request(
                    url,
                    data=body,
                    headers={
                        "User-Agent": USER_AGENT,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=180) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as exc:  # noqa: BLE001 - we retry on any failure
                last_error = exc
                print(f"  {url} attempt {attempt} failed: {exc}", file=sys.stderr)
    raise RuntimeError(f"all Overpass mirrors failed; last error: {last_error}")


def classify(tags: dict) -> str:
    """Return a simple kiln-type label from the OSM tags."""
    product = (tags.get("product") or "").lower()
    man_made = (tags.get("man_made") or "").lower()
    if man_made == "kiln":
        return "kiln"
    if "brick" in product:
        return "brickworks"
    if tags.get("industrial", "").lower().startswith("brick"):
        return "brickyard"
    return "industrial"


def to_features(raw: dict) -> list[dict]:
    """Turn Overpass elements into GeoJSON point features with coordinates."""
    features: list[dict] = []
    for el in raw.get("elements", []):
        if el.get("type") == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:  # way or relation -> use the computed centre
            centre = el.get("center", {})
            lat, lon = centre.get("lat"), centre.get("lon")

        if lat is None or lon is None:
            continue
        if not (BD_LAT_MIN <= lat <= BD_LAT_MAX and BD_LON_MIN <= lon <= BD_LON_MAX):
            continue

        tags = el.get("tags", {})
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
                "properties": {
                    "osm_id": f"{el.get('type')}/{el.get('id')}",
                    "name": tags.get("name"),
                    "kind": classify(tags),
                },
            }
        )
    return features


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    default_out = Path(__file__).resolve().parents[2] / "data" / "kilns.geojson"
    parser.add_argument("--out", type=Path, default=default_out)
    args = parser.parse_args()

    print("Querying OpenStreetMap Overpass for Bangladesh brick kilns ...", file=sys.stderr)
    raw = fetch_raw()
    features = to_features(raw)

    if not features:
        print("ERROR: no kiln features returned. Not overwriting output.", file=sys.stderr)
        return 1

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenStreetMap via Overpass API",
            "license": "ODbL",
            "attribution": "(c) OpenStreetMap contributors",
            "feature_count": len(features),
        },
        "features": features,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fc), encoding="utf-8")
    print(f"Wrote {len(features)} kiln features to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
