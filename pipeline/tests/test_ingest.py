"""Integration tests for the ingest Lambda against AWS Emulator.

Run with `make emu-test`. The handler is imported unchanged; only its
public-archive client is swapped, see the `ingest` fixture.
"""
import csv
import datetime as dt
import gzip
import io
import json
import os
import uuid

import boto3
import pytest

OPENAQ = "openaq-data-archive"
STATIONS_FILE = os.environ["STATIONS_FILE"]


def openaq_day(location_id, day, rows):
    """Write one synthetic OpenAQ archive day file (same key layout as the real archive)."""
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["location_id", "sensors_id", "location", "datetime",
                                        "lat", "lon", "parameter", "units", "value"])
    w.writeheader()
    for when, param, value in rows:
        w.writerow({"location_id": location_id, "sensors_id": 1, "location": "x", "datetime": when,
                    "lat": 0, "lon": 0, "parameter": param, "units": "µg/m³", "value": value})
    key = (f"records/csv.gz/locationid={location_id}/year={day:%Y}/month={day:%m}/"
           f"location-{location_id}-{day:%Y%m%d}.csv.gz")
    boto3.client("s3").put_object(Bucket=OPENAQ, Key=key, Body=gzip.compress(buf.getvalue().encode()))


@pytest.fixture(scope="session")
def archive():
    s3 = boto3.client("s3")
    try:
        s3.create_bucket(Bucket=OPENAQ)
    except s3.exceptions.BucketAlreadyOwnedByYou:
        pass
    today = dt.date.today()
    d2, d3 = today - dt.timedelta(days=2), today - dt.timedelta(days=3)
    # Dhaka University (22): latest valid pm25 is 87.25; 1500 is out of range, pm10 is ignored.
    openaq_day(22, d2, [(f"{d2}T08:00:00+06:00", "pm25", "61.0"),
                        (f"{d2}T10:00:00+06:00", "pm25", "87.25"),
                        (f"{d2}T11:00:00+06:00", "pm25", "1500"),
                        (f"{d2}T12:00:00+06:00", "pm10", "140")])
    # US Diplomatic Post (2445): no file two days ago, so the handler must fall back to day 3.
    openaq_day(2445, d3, [(f"{d3}T09:00:00+06:00", "pm25", "112.4")])
    # Corrupt (not gzip) file for another station: must be skipped, not crash the run.
    stations = json.load(open(STATIONS_FILE))["stations"]
    bad = stations[2]["location_id"]
    s3.put_object(Bucket=OPENAQ, Key=f"records/csv.gz/locationid={bad}/year={d2:%Y}/month={d2:%m}/"
                                     f"location-{bad}-{d2:%Y%m%d}.csv.gz", Body=b"not gzip")
    return stations


@pytest.fixture
def ingest(archive, monkeypatch):
    import handler
    # The real handler reads OpenAQ with an UNSIGNED client. The emulator rejects
    # unsigned requests (AccessDenied) and doesn't evaluate bucket policies, so a
    # local bucket can't be made public. Read the seeded archive with the signed client.
    monkeypatch.setattr(handler, "_s3_public", handler._s3)
    bucket = f"airshonket-data-{uuid.uuid4().hex[:8]}"
    s3 = boto3.client("s3")
    s3.create_bucket(Bucket=bucket)
    s3.upload_file(STATIONS_FILE, bucket, "data/bd_stations.json")
    monkeypatch.setenv("DATA_BUCKET", bucket)
    return handler, bucket


def read(bucket, key):
    obj = boto3.client("s3").get_object(Bucket=bucket, Key=key)
    return obj, obj["Body"].read().decode()


def test_latest_geojson_has_only_stations_with_valid_readings(ingest, archive):
    handler, bucket = ingest
    result = handler.handler({}, None)

    assert result["stations_total"] == len(archive) == 28
    assert result["readings_written"] == 2
    obj, body = read(bucket, "data/latest_pm25.geojson")
    assert obj["ContentType"] == "application/geo+json"
    assert obj["CacheControl"] == "public, max-age=300"
    geo = json.loads(body)
    by_id = {f["properties"]["location_id"]: f for f in geo["features"]}
    assert by_id[22]["properties"]["pm25"] == 87.2  # latest in-range pm25, rounded
    assert by_id[22]["geometry"]["coordinates"] == [90.398, 23.728]
    assert by_id[2445]["properties"]["pm25"] == 112.4  # fell back to an older day
    assert geo["metadata"]["station_count"] == 2


def test_snapshot_is_dated_ndjson(ingest):
    handler, bucket = ingest
    result = handler.handler({}, None)

    today = dt.datetime.now(dt.timezone.utc)
    assert result["snapshot_key"].startswith(f"snapshots/dt={today:%Y-%m-%d}/pm25_")
    obj, body = read(bucket, result["snapshot_key"])
    assert obj["ContentType"] == "application/x-ndjson"
    rows = [json.loads(line) for line in body.splitlines()]
    assert {r["location_id"] for r in rows} == {22, 2445}


def test_missing_station_list_fails_loudly(ingest):
    handler, bucket = ingest
    boto3.client("s3").delete_object(Bucket=bucket, Key="data/bd_stations.json")
    with pytest.raises(handler._s3.exceptions.NoSuchKey):
        handler.handler({}, None)
