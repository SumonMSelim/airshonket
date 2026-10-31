# AirShonket infrastructure (AWS CDK)

One CDK stack deploys everything the live map needs:

- a **private S3 bucket** holding the datasets and the static site
- a **CloudFront** distribution (Origin Access Control) serving it publicly
- an **ingest Lambda** that reads the OpenAQ public S3 archive and writes
  `latest_pm25.geojson` plus history snapshots back to the bucket
- an **EventBridge** rule running the Lambda every 30 minutes
- an **Amazon Location Service API key** for the v2 Standard map style

The frontend never calls a backend at request time. The Lambda writes small
static files; CloudFront serves them. This keeps cost and latency low.

## Prerequisites

- Node and the AWS CLI (already present on the dev machine).
- Working credentials: `aws sts get-caller-identity --profile sumonmselim`.
- The datasets built once: `data/kilns.geojson` and `data/bd_stations.json`
  (see `../pipeline/scripts`). `data/latest_pm25.geojson` is optional at deploy
  time; the Lambda regenerates it on its first run.

## Note on the toolchain

Node 26 breaks `ts-node`, which the default CDK template uses. We compile to
`dist/` with `tsc` instead and point `cdk.json` at `dist/bin/airshonket.js`.
So always run `npm run build` before a CDK command.

## Deploy

```bash
cd infra-cdk
npm install
npm run build

export AWS_PROFILE=sumonmselim
export CDK_DEFAULT_ACCOUNT=507044010153
export CDK_DEFAULT_REGION=us-east-1

# First time in this account/region only:
npx cdk bootstrap

npx cdk synth        # offline check
npx cdk deploy
```

On success CDK prints outputs:

- `SiteUrl`: the public map URL (allow ~10 min on first deploy).
- `DataBucketName`: the bucket name.
- `MapApiKeyName`: the Location API key name. Get its value with:
  `aws location describe-key --key-name airshonket-maps-key --region us-east-1 --query Key --output text`
- `MapStyleUrlTemplate`: paste the key value into `web/config.js` as
  `LOCATION_STYLE_URL`, then redeploy so the live site uses the AWS base map.

## Cost safety

Set a budget alert separately (one-off, console or CLI). Expected cost for a
demo is about `$0`; see `../docs/SCOPE.md` for the breakdown.

## Teardown

```bash
npx cdk destroy
```

The bucket has `autoDeleteObjects` and `RemovalPolicy.DESTROY`, so destroy
removes everything cleanly. The Location API key is deleted with the stack.

## Relationship to infra/ (shell scripts)

`../infra/` holds equivalent AWS CLI scripts written first. They are kept as a
reference and a fallback. This CDK app is the primary, reviewable deployment.
