-- Daily average PM2.5 per station over the last 7 days.
--
-- Partition pruning on dt keeps the scan tiny (well under Athena's 10 MB
-- minimum per query), so each run costs effectively nothing. The ingest
-- Lambda can run this and write the result as a small JSON to S3 for the UI,
-- so the map never queries Athena directly.

SELECT
  location_id,
  name,
  round(avg(pm25), 1) AS avg_pm25,
  count(*)            AS readings,
  dt
FROM airshonket.pm25_snapshots
WHERE dt >= date_format(current_date - interval '7' day, '%Y-%m-%d')
GROUP BY location_id, name, dt
ORDER BY dt DESC, avg_pm25 DESC;
