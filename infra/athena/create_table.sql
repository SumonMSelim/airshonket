-- AirShonket history: Athena table over the PM2.5 snapshots in S3.
--
-- The ingest Lambda writes one newline-delimited JSON object per station per
-- run, under snapshots/dt=YYYY-MM-DD/. We read those as an external table
-- partitioned by date. This powers trend queries without the map ever
-- touching Athena directly (the Lambda writes pre-aggregated files for the UI).
--
-- Replace <DATA_BUCKET> before running, or let infra/40_athena.sh substitute it.

CREATE DATABASE IF NOT EXISTS airshonket;

CREATE EXTERNAL TABLE IF NOT EXISTS airshonket.pm25_snapshots (
  location_id   bigint,
  name          string,
  lat           double,
  lon           double,
  pm25          double,
  reading_time  string,
  ingested_at   string
)
PARTITIONED BY (dt string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://<DATA_BUCKET>/snapshots/'
TBLPROPERTIES ('projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.format' = 'yyyy-MM-dd',
  'projection.dt.range' = '2026-01-01,NOW',
  'projection.dt.interval' = '1',
  'projection.dt.interval.unit' = 'DAYS',
  'storage.location.template' = 's3://<DATA_BUCKET>/snapshots/dt=${dt}/');
