# Local testing with AWS Emulator

The ingest Lambda (`pipeline/lambda/handler.py`) is tested against
[AWS Emulator](https://aws.amazon.com/products/developer-tools/emulator/), a
local emulator of the AWS APIs. No AWS account is needed and nothing reaches
real AWS.

```
make emu-up     # build and start the emulator (https://127.0.0.1:9297)
make emu-test   # run pipeline/tests against it
make emu-down   # stop it and delete its state
```

Requires Docker. The emulator image is built from the LTS package; the
version is pinned in `emulator/Dockerfile` (`EMULATOR_VERSION`). Releases fix
fidelity continuously, so read the release notes before bumping it.

## How it is wired

- `compose.yml` runs the emulator and a `tests` container. The tests share the
  emulator's network namespace so `https://127.0.0.1:9297` matches its
  self-signed certificate.
- The emulator generates new credentials and a CA certificate on every start.
  They are shared with the tests through a volume, together with the eight
  environment variables in `compose.yml` (`AWS_ENDPOINT_URL`, ...).
- `pipeline/tests/conftest.py` refuses to run unless `AWS_ENDPOINT_URL` points
  at `https://127.0.0.1:...` and the account is `000000000000`. If the endpoint
  were unset, boto3 would call real AWS.
- Telemetry is turned off (`--telemetry off`).

## What the tests cover

They import `handler.py` unchanged and seed the emulator with the real
`data/bd_stations.json` plus synthetic OpenAQ day files: an out-of-range value,
a non-PM2.5 row, a fallback to an older day, and a corrupt gzip. They check the
GeoJSON and snapshot objects, including `ContentType` and `CacheControl`.

## Known differences from AWS

- **The OpenAQ read is not anonymous.** The handler reads the public OpenAQ
  bucket with an unsigned client. The emulator denies anonymous reads (also
  with `--auth off`) and does not evaluate bucket policies, so the tests swap
  that one client for the signed one (`monkeypatch` in `test_ingest.py`).
- **No IAM evaluation.** Use real AWS to test permissions, including the
  least-privilege policy in the CDK stack.
- **Lambda cannot call back into the emulator** (v1.0.322). A function deployed
  to the emulator has empty `boto3`/`botocore` modules and no credentials or
  endpoint, so the handler is tested in-process instead. Self-contained
  functions run, and EventBridge schedules fire.
- **CDK.** `cdk bootstrap` works. `cdk deploy` stops at
  `AWS::Location::APIKey` (unsupported) and at the `BucketDeployment` helper,
  which needs a Lambda that calls S3. Deploy the stack to real AWS.
- State lives in memory and is lost when the emulator stops.
