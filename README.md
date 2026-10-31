# AirShonket

Breathe easy. Know the air, know what to do.

A public web map of air quality across Bangladesh. It shows how bad the air is
now, where the pollution comes from, and what each person should do about it
today.

Built for the AWS "Map It" weekend challenge. See the full plan in
[`docs/SCOPE.md`](docs/SCOPE.md).

## Data sources

- Air quality: OpenAQ. Read from the public archive on Amazon S3
  (`s3://openaq-data-archive`, no AWS account needed). Licensed by OpenAQ.
- Pollution sources: brick kilns from OpenStreetMap, via the Overpass API.
  Licensed under ODbL. Attribution: © OpenStreetMap contributors.

## Layout

```
web/         static MapLibre front end (S3 + CloudFront)
pipeline/    python scripts and the scheduled ingest Lambda
  scripts/   one-time pulls (station list, OSM kilns)
  lambda/    scheduled ingest handler
data/        small local cache of pulled data
infra/       notes and IaC for AWS resources
docs/        scope and design notes
```

## AWS services

- Amazon S3 — raw snapshots, Iceberg table, static datasets, pre-aggregated files.
- AWS Lambda — scheduled ingest, Athena queries, writing the files the map reads.
- Amazon EventBridge — triggers the ingest Lambda on a schedule.
- Apache Iceberg on S3 + Amazon Athena — history and aggregation.
- Amazon Location Service — base map tiles.
- Amazon CloudFront — serves the static web app.

The front end never calls Athena directly. Lambda writes small static files to
S3, and the map reads those through CloudFront. This keeps the site fast and the
cost near zero.

## Licence

Code: MIT. See [`LICENSE`](LICENSE).
Data: OpenAQ terms for air quality; ODbL for OpenStreetMap kilns.
