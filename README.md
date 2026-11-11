# AirShonket

Breathe easy. Know the air, know what to do.

A public web map of air quality across Bangladesh. It shows how bad the air is
now, where the pollution comes from, and what each person should do about it
today.

Built for the AWS "Map It" weekend challenge.

Live map: https://airshonket.mol.la/

## Data sources

- Air quality: OpenAQ. Read from the public archive on Amazon S3
  (`s3://openaq-data-archive`, no AWS account needed). Licensed by OpenAQ.
- Pollution sources: brick kilns from OpenStreetMap, via the Overpass API.
  Licensed under ODbL. Attribution: © OpenStreetMap contributors.
- Wind: Open-Meteo. Free, no key.

## Layout

```
web/         static MapLibre front end (S3 + CloudFront)
pipeline/    python scripts and the scheduled ingest Lambda
  scripts/   one-time pulls (station list, OSM kilns)
  lambda/    scheduled ingest handler
  tests/     handler tests that run against AWS Emulator
data/        small local cache of pulled data
infra/       shell-script notes and IaC for AWS resources
infra-cdk/   the AWS CDK app (primary IaC) and deploy.sh
emulator/    Dockerfile for AWS Emulator (used by compose.yml)
```

## AWS services

- Amazon Location Service: v2 Standard base map tiles, via a tile-only API key.
- Amazon S3: a private bucket for the datasets, the latest readings, and dated
  history snapshots. The public OpenAQ archive on S3 is the open-data source.
- AWS Lambda: scheduled ingest. Reads the OpenAQ public archive and writes the
  small static files the map reads.
- Amazon EventBridge: triggers the ingest Lambda every 30 minutes.
- Amazon CloudFront: serves the static web app publicly, with Origin Access
  Control so the bucket stays private. Custom domain over HTTPS (ACM).

The front end never calls a backend at request time. Lambda writes small static
files to S3, and the map reads those through CloudFront. History and aggregation
can be run over the snapshots with Amazon Athena offline, never on the live
request path. This keeps the site fast and the cost near zero.

## Deploy

```
cd infra-cdk
npm install
npm run build
./deploy.sh
```

`deploy.sh` runs `cdk deploy`, then fetches the Amazon Location key and writes
it into `runtime-config.js` directly in the S3 bucket, so the map key never
lives in source. See `infra-cdk/README.md` for details.

## Test locally

```
make emu-up     # start AWS Emulator in Docker
make emu-test   # run the ingest handler tests against it
make emu-down
```

No AWS account needed. See `emulator/README.md`.

## Licence

Code: AGPL-3.0. See [`LICENSE`](LICENSE).
Data: OpenAQ terms for air quality; ODbL for OpenStreetMap kilns.
