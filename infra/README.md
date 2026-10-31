# AirShonket infrastructure

Scripts to deploy AirShonket on AWS. They use the AWS CLI, are idempotent
(safe to re-run), and are ordered by blast radius: the cost alarm first, then
private storage, then compute, then the public site last.

Nothing here runs until you have working AWS credentials. Check with:

    aws sts get-caller-identity

If that prints your account, you are ready.

## Order

| Script | What it does | Cost risk |
|--------|--------------|-----------|
| `config.sh` | Shared names and region. Edit if you like. Creates nothing. | none |
| `10_budget.sh` | `$5` monthly budget with email alerts. Run first. | none |
| `20_data_bucket.sh` | Private S3 bucket + upload datasets. | ~none |
| `30_lambda.sh` | IAM role, ingest Lambda, 30-min EventBridge schedule. | ~none |
| `40_location_service.sh` | Amazon Location map + API key; prints style URL. | free trial |
| `40b_athena.sh` | Athena DB + external table over snapshots. | pennies |
| `50_site_cloudfront.sh` | Publish the static site via CloudFront. | ~none |

## How to run

```bash
cd airshonket
export AWS_REGION=ap-south-1          # or your choice
export NOTIFY_EMAIL=you@example.com   # for the budget alert

bash infra/10_budget.sh
bash infra/20_data_bucket.sh
bash infra/30_lambda.sh
# test the lambda once:
aws lambda invoke --function-name airshonket-ingest /tmp/out.json && cat /tmp/out.json
bash infra/40_location_service.sh     # paste the style URL into web/config.js
bash infra/40b_athena.sh
bash infra/50_site_cloudfront.sh      # prints the public URL
```

## Important: site layout and data paths

The web app fetches its data with paths relative to `index.html`:

- kilns:    `../data/kilns.geojson`
- stations: `../data/latest_pm25.geojson`

So the site and the data must sit so those relative paths resolve. Two ways:

1. Serve `web/` at the CloudFront **root** and put data at `/data/` (one level
   up does not exist at the root, so for hosting we change the app to fetch
   `data/...` — see note below), **or**
2. Keep `web/` and `data/` as sibling folders under one prefix and point the
   distribution's default root object at `web/index.html`.

For the deployed build we use option 1: upload `web/` to the bucket root and
`data/` to `/data/`, and set `config.js` `KILNS_URL`/`STATIONS_URL` to
`data/kilns.geojson` and `data/latest_pm25.geojson` (no `../`). The committed
values use `../data/...` because locally the site is served from the project
root with `web/` as a subfolder. `50_site_cloudfront.sh` will handle this
difference at upload time. This is the one place local and deployed paths
differ, and it is called out here on purpose.

## Amazon Location Service note

The script uses the v2 Maps style-descriptor URL:

    https://maps.geo.<region>.amazonaws.com/v2/styles/Standard/descriptor?key=<API_KEY>

Confirm it returns JSON (`{"version":8,...}`) before wiring it in. If your
region exposes the older v1 Maps API instead, create a map with
`aws location create-map` and use that map's style URL. Either satisfies the
hackathon's "use an AWS location service" requirement.

The API key is restricted to map tile actions only, so it is safe to ship in
the public static site. Once the CloudFront domain exists, add a referer
restriction to the key to lock it to that domain.

## Teardown

To avoid any lingering cost after the hackathon:

```bash
aws cloudfront ...        # disable then delete the distribution
aws lambda delete-function --function-name airshonket-ingest
aws events delete-rule --name airshonket-ingest-30min --force
aws s3 rb s3://airshonket-data-<suffix> --force
aws location delete-key --key-name airshonket-maps-key
```

A full teardown script can be added if wanted.
