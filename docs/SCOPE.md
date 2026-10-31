# AirShonket: Project Scope

Breathe easy. Know the air, know what to do.

A public web map of air quality across Bangladesh. It shows how bad the air
is now, where the pollution comes from, and what each person should do about
it today. Built for the AWS "Map It" weekend challenge.

This document is the agreed plan. It is written in plain British English with
short sentences. It is the single source of truth for the build.

---

## 1. The problem we are solving

Dhaka and much of Bangladesh have some of the worst air in the world. It gets
worse every winter, from about November onwards. Fine particles, called PM2.5,
are the main danger. People feel the bad air but they cannot see it, and they
do not always know what to do on a bad day.

AirShonket answers three questions for an ordinary person:

1. How bad is the air near me right now?
2. Where is the pollution coming from?
3. What should I do today, for my own situation?

---

## 2. The dataset

Two layers of open data. Both are free to use and contain no personal data.

### Layer 1: Live and recent air quality (OpenAQ)  [VERIFIED]

- Source: OpenAQ. It gathers readings from government and other monitors.
- We read the public OpenAQ archive on Amazon S3:
  `s3://openaq-data-archive`. It needs no AWS account. Access with
  `aws s3 ... --no-sign-request`. This is the AWS Open Data part of the entry.
- Verified live: a real file dated 27 October 2026 was read during data checks.
  Readings are hourly, with lat, lon, parameter, unit, and value in µg/m³.
- We use PM2.5 as the main pollutant. We may add PM10 later.
- Coverage: government monitors exist in Dhaka, Narayanganj, Gazipur, Savar,
  Mymensingh, Narsingdi, Chattogram, Khulna, Cumilla, Barishal, Rajshahi,
  Sylhet, and Rangpur. This gives good national spread.

Known gap: the S3 archive is keyed by numeric location id and has no country
index. To get the Bangladesh station ids once, we call the OpenAQ v3 API, which
needs a free API key. We use the key for that one-time lookup only, then the
pipeline reads from S3. The key is not a core run-time dependency.

Honest limit: monitors cluster in cities. Rural districts are sparse. We will
show real monitor points where they exist. We will draw a careful interpolated
surface, but we will be clear on the map where data is thin. We will not fake
precision where there are no monitors.

### Layer 2: Pollution sources (brick kilns)  [VERIFIED, source changed]

- Source: OpenStreetMap, queried through the Overpass API.
- Licence: ODbL. Open with attribution. This satisfies the rules.
- Verified live: a query returned 1,843 brick kiln features across Bangladesh,
  with real coordinates. The spread covers the whole country, latitude 20.9 to
  26.3 and longitude 88.2 to 92.4.
- Tags used: `man_made=kiln`, `product~brick`, `craft=brickworks`, and
  `landuse=industrial` with `industrial~brick`.
- We will label this layer honestly as "known kilns mapped in OpenStreetMap".
  OSM mapping is incomplete, so this is fewer than the ~9,000 kilns that
  research estimates exist. We do not over-claim.

Rejected sources, recorded so we do not revisit them:
- Edinburgh and Nottingham study on Zenodo (DOI 10.5281/zenodo.15516263).
  Licence is CC-BY-4.0, but the per-kiln coordinate file is restricted and not
  included. Only upazila-level aggregates are open. We will not work around a
  data restriction. See the optional layer below.
- SentinelKilnDB. Point data sits on Kaggle behind an account, and the public
  GitHub repo covers India, not Bangladesh, with no licence file. Too uncertain.

### Optional richer layer (stretch only): Edinburgh open aggregates  [VERIFIED]

- Source: the Edinburgh and Nottingham study open supplementary data on Zenodo.
- Licence: CC-BY-4.0. Open with attribution.
- Content: upazila-level, so boundary data not points. Kiln-attributable deaths
  by upazila, and a modelled PM2.5 surface for Bangladesh from the InMAP model.
- Use: a second, richer map layer that shades sub-districts by modelled
  kiln-attributable health harm. Striking for storytelling. Add on top only if
  time allows, with clear attribution.

---

## 3. What a user can do

1. See the whole country at a glance. The map is coloured by AQI band. The user
   can pan and zoom.
2. Tap any place, or use their own location, to get the local reading and a
   plain-language health action.
3. Set a simple profile so the advice fits them.

### Personalised actionables

The user picks one or more profile tags:

- Healthy adult (default)
- Has asthma, heart, or lung condition
- Young child at home
- Elderly
- Outdoor worker or cyclist

The advice changes with the AQI band and the profile. Example on a bad day:

> Air near you in Mirpur is 198. That is unhealthy. You told us someone at home
> has asthma. Keep windows closed. Run an air purifier if you have one. Wear a
> proper mask if you go out. Avoid outdoor exercise today.

AQI bands and base guidance:

- 0 to 50, Good. Air is clean. A good day to open windows and go outside.
- 51 to 100, Moderate. Fine for most people. Very sensitive people should take
  it easy outdoors.
- 101 to 150, Unhealthy for sensitive groups. Children, elderly, and people
  with asthma should limit long spells outdoors.
- 151 to 200, Unhealthy. Wear a mask outside. Keep windows shut. Use a purifier
  if you have one.
- 201 to 300, Very unhealthy. Avoid outdoor activity. A mask is essential. Seal
  windows.
- 301 and above, Hazardous. Stay indoors. Use an N95 mask if you must go out.
  Vulnerable people should not go out at all.

Safety note: this is general public health guidance based on standard AQI
bands. It is not personal medical advice. The wording makes that clear.

---

## 4. The signature feature: source attribution

When the user taps a place, they see more than a number. They see the likely
sources near them.

> 41 brick kilns within 15 km. 26 of them are upwind of you right now.

How it works:

- We reuse the spatial grid and distance weighting engine from the existing
  Nomadio code in `lib/services/geocoding_service.dart`. We port the idea to
  the web app.
- We combine kiln positions with the current wind direction to find which
  kilns are upwind of the tapped point.
- This turns a plain dot map into a simple cause-and-effect story.

Wind direction source to be confirmed during build. A simple open weather
source is enough for v1.

---

## 5. Architecture and AWS pipeline

Data flows from open sources, through an AWS pipeline, to a public map.

```
OpenAQ public S3 archive (s3://openaq-data-archive, no account needed)
        |                     OpenStreetMap Overpass API (kilns, one-time pull)
        v                                   |
EventBridge schedule  ->  AWS Lambda (ingest)
        |
        v
Amazon S3 (raw snapshots, Parquet; static kiln GeoJSON)
        |
        v
Apache Iceberg table on S3  <->  Amazon Athena (history, aggregation)
        |
        v
AWS Lambda writes small pre-aggregated GeoJSON / JSON to S3
        |
        v
Amazon S3 + CloudFront  ->  static web app (MapLibre GL)
        |
        +-- Amazon Location Service  (base map tiles)
```

### AWS services used

- Amazon S3. Stores raw snapshots, the Iceberg table, the static kiln dataset,
  and the pre-aggregated files the frontend reads.
- AWS Lambda. Pulls current readings on a schedule. Runs the Athena and Iceberg
  work. Writes the small files the frontend reads.
- Amazon EventBridge. Triggers the Lambda on a schedule, for example every 30
  minutes.
- Apache Iceberg on S3, queried with Amazon Athena. Stores history and does
  aggregation. This is the data-service part of the entry.
- Amazon Location Service. Provides the base map tiles. This is the
  location-service part of the entry.
- Amazon CloudFront. Serves the static web app, fast and public.

### Key design rule to keep cost and latency low

The public frontend never calls Athena directly. Lambda does all Athena and
Iceberg work on the schedule, then writes small static files to S3. The
frontend reads those static files through CloudFront. This keeps the site fast
and keeps the bill near zero.

---

## 6. The web app

- Static single-page app. No server to run.
- Map library: MapLibre GL JS. It works natively with Amazon Location Service.
- Base map: Amazon Location Service tiles.
- Layers:
  1. AQI points and a careful interpolated surface, coloured by band.
  2. Brick kiln sources, clustered at low zoom.
  3. Tap-to-inspect panel with the reading, the sources, and the personalised
     action.
- Profile picker for the personalised advice. Stored in the browser only. No
  accounts, no server storage.

---

## 7. Scope limits for the weekend

In scope for v1:

- Now and recent air quality. Not a multi-day forecast.
- Nationwide coverage, honest about sparse rural data.
- Personalised actionables by profile tag.
- Source attribution with current wind direction.
- Full AWS pipeline as drawn above.

Out of scope for v1:

- Multi-day forecast. Stretch goal only.
- User accounts, login, or any write path.
- Mobile app. This is a web entry.
- Historical deep-dives beyond what the pipeline already stores.

Stretch goals if time allows:

- Multi-day forecast layer from an open forecast source.
- A time slider that shows the smog building through the season.
- PM10 and other pollutants.

---

## 8. Cost estimate

For a hackathon demo over a few weeks of light traffic, expect about **$0**.
Realistic worst case, ignoring Free Tier entirely, is **well under $1**.

- S3 storage and requests: tiny. A few megabytes of data. Effectively $0.
- Lambda on a 30-minute schedule: about 1,440 runs a month, each a few seconds.
  Inside the Lambda Free Tier. $0.
- EventBridge schedule: free at this volume.
- Athena: $5 per terabyte scanned, 10 MB minimum per query. Our data is small
  and columnar, so each query hits the 10 MB minimum, about $0.00005 per query.
  Pennies for the whole demo. The frontend never queries Athena, which keeps
  this low.
- Amazon Location Service tiles: billed per tile via GetTiles. Glyphs, styles,
  and sprites are free. A heavy session loads maybe 40 tiles. At about $0.40 per
  1,000 tiles, even 10,000 heavy sessions is about $0.16. Plus a three-month
  free trial and a monthly Free Tier allowance. Realistically $0.
- CloudFront: a few megabytes of transfer for a demo. Inside Free Tier. $0.

Caveats, stated honestly:

- The exact current per-1,000 tile rate and the exact Free Tier tile allowance
  were not pinned, because the pricing page is JavaScript-rendered. The $0.40
  per 1,000 figure is from a 2023 source. It does not change the conclusion,
  because even several times that rate is still pennies for a demo.
- We will set an AWS Budgets alert at $5 as a hard safety net. This is free.

---

## 9. Submission checklist

The entry must include all of these:

- [ ] Live public map on AWS, reachable by judges and the AI scorer.
- [ ] At least one AWS location or data service. We use several: Location
      Service, S3, Iceberg on S3, Athena.
- [ ] A written project on AWS Builder Center. It describes the dataset, how the
      data is placed on the map, and the AWS services used.
- [ ] A video under three minutes showing the live map and what people can
      explore. Uploaded to YouTube, Vimeo, Facebook, or Youku.
- [ ] Only data we have the right to use. No personal or sensitive data.
- [ ] Original project, not previously published.
- [ ] Optional but encouraged: a public code repository under an approved OSI
      open source licence.

Deadline: Monday 2 November 2026, 1:00 PM PT.

---

## 10. First actions before writing app code

1. [done] Confirm the OpenAQ S3 archive is readable and live.
2. [done] Confirm a licensed, point-level kiln source. Using OpenStreetMap,
   ODbL, 1,843 kilns across Bangladesh.
3. [you] Register a free OpenAQ API key for the one-time Bangladesh station
   lookup.
4. Pull the Bangladesh station list once, using the key, and cache it.
5. Pull the OpenStreetMap kilns once and save as static GeoJSON in S3.
6. Create the S3 buckets and set the AWS Budgets $5 alert.
7. Stand up Amazon Location Service and confirm MapLibre renders a Bangladesh
   base map.
8. Write the ingest Lambda and the EventBridge schedule.
9. Create the Iceberg table and the first Athena aggregation query.
10. Build the static map with the two data layers.
11. Add the profile picker and the personalised actionables.
12. Add the upwind source attribution feature.
13. Ship to CloudFront. Record the video. Write the Builder Center project.

## 11. Repository layout

The web app and pipeline live in a new top-level `airshonket/` directory,
separate from the Nomadio Flutter app.

```
airshonket/
  README.md
  web/                 static MapLibre front end (S3 + CloudFront)
  pipeline/            python scripts and the ingest Lambda
    scripts/           one-time pulls (stations list, OSM kilns)
    lambda/            scheduled ingest handler
  data/                small local cache of pulled data (git-ignored if large)
  infra/               notes and IaC for AWS resources
```
```
