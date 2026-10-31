# Session Handoff

This note lets a fresh Kiro CLI session, started from this folder, pick up
exactly where the previous one stopped. Read this file first, then continue.

## What AirShonket is

A public web map for the AWS "Weekend Challenge: Map It" hackathon. It shows
live PM2.5 air quality for Bangladesh, brick kiln pollution sources across the
whole country, live wind so you can see which kilns are upwind of you, and
personalised health advice (windows, air purifier, mask) based on a user
profile. Copy is British English, simple sentences, no em dashes anywhere.

Deadline: Monday 2 November 2026, 1:00 PM PT.
Priorities that score points: usefulness and impact (25%), creativity and
storytelling (25%). Stay in AWS Free Tier (target about zero cost). Be honest
about data limits.

## Current status

Done and verified locally:
- Full web app in `web/`: map, 1843 kilns (clustered), live PM2.5 stations,
  click-to-inspect panel, personalised advice by profile, English and Bangla
  toggle with Bangla digits and localised brand, find-my-location, Dhaka
  Airport demo button, upwind-kilns with live wind and a wind indicator,
  loading overlay, first-time hint, About modal.
- CDK app in `infra-cdk/` builds and `cdk synth` succeeds.
- Everything committed. No em dashes. Latest commit before this note: 57b9fb3.

Not done yet:
- AWS deployment (budget alert, bootstrap, deploy).
- Wiring the Amazon Location style URL into `web/config.js` after deploy.
- Running the ingest Lambda once and confirming the live CloudFront URL.
- The written Builder Center submission and the demo video (under 3 minutes).

## AWS facts a new session needs

- Account: 507044010153
- Profile: sumonmselim (SSO SuperAdministrator)
- Region: us-east-1
- Caller check: `aws sts get-caller-identity --profile sumonmselim`
- The shell env has `AWS_PROFILE=sumonmselim` set. Public OpenAQ bucket reads
  must use `env -u AWS_PROFILE ...` or an explicit `--no-sign-request`, because
  signed requests to that public bucket can fail.
- OpenAQ API key lives at `~/.config/openaq/.env`. Do not read it into the
  session or print it. Source it inline only in the command that needs it.

## Deployment plan (next actions, in order)

1. Set a safety budget. Needs a notify email from the user (or skip it):
   a 5 USD AWS Budgets alert.

2. Build and bootstrap CDK (one time per account/region):
   ```
   cd infra-cdk
   npm install
   npm run build
   AWS_PROFILE=sumonmselim CDK_DEFAULT_ACCOUNT=507044010153 \
     CDK_DEFAULT_REGION=us-east-1 npx cdk bootstrap
   ```
   Note: Node 26 breaks ts-node, so CDK compiles to `dist/` and runs from JS.
   `cdk.json` app is `node dist/bin/airshonket.js`. Always `npm run build` first.

3. Deploy:
   ```
   AWS_PROFILE=sumonmselim CDK_DEFAULT_ACCOUNT=507044010153 \
     CDK_DEFAULT_REGION=us-east-1 npx cdk deploy
   ```
   Stack `AirshonketStack` creates: private S3 (block all public, DESTROY +
   autoDeleteObjects), CloudFront + OAC, two BucketDeployments (data to
   `/data`, web to root, excluding `sample/**`), ingest Lambda (Python 3.12),
   EventBridge rate(30 min), and `location.CfnAPIKey` (keyName
   `airshonket-maps-key`, actions `geo-maps:GetTile` and `geo-maps:GetStaticMap`).
   Outputs: SiteUrl, DataBucketName, MapApiKeyName, MapStyleUrlTemplate.

4. Wire the map style. The API key value is NOT a CloudFormation output.
   Fetch it with:
   ```
   aws location describe-key --key-name airshonket-maps-key \
     --region us-east-1 --query Key --output text
   ```
   Build the Standard style URL from the MapStyleUrlTemplate output plus the
   key. VERIFY it returns `{"version":8,...}` with curl before trusting it
   (the style URL format was not fully verifiable offline). Then set
   `LOCATION_STYLE_URL` in `web/config.js` and redeploy (step 3 again).

5. Run the Lambda once and confirm end to end:
   ```
   aws lambda invoke --function-name airshonket-ingest /tmp/out.json \
     --profile sumonmselim --region us-east-1
   ```
   Then open the SiteUrl (CloudFront) and confirm the map, kilns, live
   stations, language toggle, demo button, and wind all work live.

6. Write the Builder Center submission (dataset, how it is on the map, AWS
   services used, live URL) and record the demo video (under 3 minutes).

7. Optional: push a public GitHub repo (licence is already MIT).

## Key technical notes

- `web/config.js`: `LOCATION_STYLE_URL: null` (fill after deploy),
  `DEMO_STYLE_URL` is CARTO Voyager for local dev,
  `KILNS_URL: '../data/kilns.geojson'`,
  `STATIONS_URL: '../data/latest_pm25.geojson'`,
  `DEMO_LOCATION` is Dhaka Airport `[90.3978, 23.8433]`,
  `BD_CENTER: [90.4, 23.7]`, `BD_BOUNDS: [[87.9, 20.5], [92.8, 26.7]]`.
  `../data` resolves to `/data/` both locally and when deployed, because
  browsers clamp `../` at the site root.

- Data in `data/`: `kilns.geojson` (1843 features, OpenStreetMap, ODbL,
  committed), `latest_pm25.geojson` (live readings, generated),
  `bd_stations.json` (28 stations, gitignored but present locally, needed by
  the Lambda at deploy time).

- Live air coverage is honest: stations cluster in greater Dhaka only (28).
  Framing used in copy: live air monitoring is concentrated around Dhaka,
  kilns are shown for the whole country.

- Wind: Open-Meteo (free, no key). `wind_direction` is the direction the wind
  comes FROM. A kiln is upwind if the bearing to it is near `windFromDeg`
  (cone 45 degrees). Verified from Dhaka Airport: NW wind, 44 of 187 kilns
  upwind.

- AQI: EPA breakpoints in `aqi.js`. Verified PM2.5 45 maps to AQI 124.

- i18n: `i18n.js` has full en and bn parity. Brand: en "AirShonket",
  bn "এয়ারশনকেত". `toBanglaDigits` and `localiseNumber` localise numbers.

- localStorage keys: `airshonket.profile`, `airshonket.lang`,
  `airshonket.hintseen`.

- Local dev server:
  ```
  cd /Users/sumonmselim/Work/airshonket
  python3 -m http.server 8777 --bind 127.0.0.1
  ```
  URL: http://127.0.0.1:8777/web/index.html

- Pipeline scripts in `pipeline/scripts/`: `fetch_osm_kilns.py` (Overpass,
  needs a USER_AGENT or it returns HTTP 406), `fetch_bd_stations.py` (OpenAQ
  v3, `parameters_id=2` is PM2.5, `iso=BD`, `X-API-Key` header, needs the key
  from env), `build_latest_pm25.py` (reads the public S3 archive, drops
  non-physical values).

- Lambda `pipeline/lambda/handler.py`: reads the OpenAQ public bucket with an
  unsigned boto3 client, writes `latest_pm25.geojson` plus partitioned
  `snapshots/dt=YYYY-MM-DD/`. Env: `DATA_BUCKET`, `STATIONS_KEY`,
  `LATEST_KEY`, `SNAPSHOT_PREFIX`, `DAYS_BACK`.

## Global rule reminder

No em dashes anywhere. This is saved globally at
`~/.kiro/steering/no-emdash.md` and carries across sessions.

## How to resume in the new session

Start the CLI from this folder and say:
"Read docs/SESSION_HANDOFF.md and continue with deployment."
Then provide a notify email for the budget alert, or ask to skip it.
