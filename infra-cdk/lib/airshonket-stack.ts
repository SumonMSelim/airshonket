import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as location from 'aws-cdk-lib/aws-location';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as path from 'path';
import * as fs from 'fs';

/** Walk up from this file until we find the AirShonket project root (the dir
 *  that contains both web/ and data/). This keeps asset paths correct whether
 *  the code runs from src (ts-node) or from the compiled dist/ folder. */
function findProjectRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, 'web', 'index.html')) &&
      fs.existsSync(path.join(dir, 'data', 'kilns.geojson'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error(
    'Could not locate the AirShonket project root (expected web/ and data/ above ' +
      start +
      ')'
  );
}

/**
 * AirShonket infrastructure.
 *
 * One stack, everything the live map needs:
 *   - a private S3 bucket holding the datasets and the static site
 *   - a CloudFront distribution (Origin Access Control) serving it publicly
 *   - an ingest Lambda that reads the OpenAQ public S3 archive and writes
 *     latest_pm25.geojson + history snapshots back to the bucket
 *   - an EventBridge rule running the Lambda every 30 minutes
 *   - an Amazon Location Service API key for the v2 Standard map style
 *
 * The frontend never calls a backend at request time. The Lambda writes small
 * static files; CloudFront serves them. This keeps cost and latency low.
 */
export class AirshonketStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const projectRoot = findProjectRoot(__dirname);

    // --------------------------------------------------------- custom domain
    // Optional custom domain for CloudFront. Supplied via CDK context so the
    // ARN and hostname stay out of source:
    //   cdk deploy -c siteDomain=airshonket.mol.la \
    //     -c siteCertArn=arn:aws:acm:us-east-1:...:certificate/...
    // The ACM certificate must already be ISSUED in us-east-1 (CloudFront
    // only accepts certs from that region). DNS lives in Cloudflare, so the
    // cert is validated out-of-band before deploy and the public CNAME is
    // added to Cloudflare after deploy.
    const siteDomain = this.node.tryGetContext('siteDomain') as
      | string
      | undefined;
    const siteCertArn = this.node.tryGetContext('siteCertArn') as
      | string
      | undefined;
    const siteCertificate =
      siteDomain && siteCertArn
        ? acm.Certificate.fromCertificateArn(this, 'SiteCert', siteCertArn)
        : undefined;

    // ----------------------------------------------------------------- bucket
    // Private bucket. Public reads happen only through CloudFront (OAC).
    const bucket = new s3.Bucket(this, 'DataBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Hackathon project: allow a clean teardown with `cdk destroy`.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ----------------------------------------------------------- cloudfront
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      comment: 'airshonket',
      defaultRootObject: 'index.html',
      ...(siteDomain && siteCertificate
        ? { domainNames: [siteDomain], certificate: siteCertificate }
        : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // ----------------------------------------------------- deploy site + data
    // The web app fetches data at ./data/..., so the site files go to the
    // bucket root and the datasets go under /data. Both are served by the
    // same CloudFront origin, so the relative paths resolve.
    new s3deploy.BucketDeployment(this, 'DeployData', {
      destinationBucket: bucket,
      destinationKeyPrefix: 'data',
      sources: [
        s3deploy.Source.asset(path.join(projectRoot, 'data'), {
          // Only ship the two map files; the station list is small but not
          // needed by the browser. The Lambda reads it from the bucket.
          exclude: ['*', '!kilns.geojson', '!latest_pm25.geojson', '!bd_stations.json'],
        }),
      ],
      distribution,
      distributionPaths: ['/data/*'],
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=300')],
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: bucket,
      sources: [
        s3deploy.Source.asset(path.join(projectRoot, 'web'), {
          exclude: ['sample/**'], // sample data is dev-only
        }),
      ],
      distribution,
      distributionPaths: ['/*'],
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=300')],
    });

    // --------------------------------------------------------- ingest lambda
    const ingest = new lambda.Function(this, 'IngestFn', {
      functionName: 'airshonket-ingest',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(projectRoot, 'pipeline', 'lambda')),
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      environment: {
        DATA_BUCKET: bucket.bucketName,
        STATIONS_KEY: 'data/bd_stations.json',
        LATEST_KEY: 'data/latest_pm25.geojson',
        SNAPSHOT_PREFIX: 'snapshots',
        DAYS_BACK: '5',
      },
    });
    // Least privilege: the function only touches our own bucket. The public
    // OpenAQ bucket is read with an unsigned client, needing no permissions.
    bucket.grantReadWrite(ingest);

    new events.Rule(this, 'IngestSchedule', {
      ruleName: 'airshonket-ingest-30min',
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
      targets: [new targets.LambdaFunction(ingest)],
    });

    // ------------------------------------------------- amazon location (maps)
    // v2 Standard style is served via an API key alone (no Map resource). The
    // key is restricted to map tile actions, so it is safe to ship in the
    // public static site.
    const mapKey = new location.CfnAPIKey(this, 'MapApiKey', {
      keyName: 'airshonket-maps-key',
      noExpiry: true,
      restrictions: {
        allowActions: ['geo-maps:GetTile', 'geo-maps:GetStaticMap'],
        allowResources: [
          `arn:aws:geo-maps:${this.region}::provider/default`,
        ],
      },
    });

    const styleUrlTemplate =
      `https://maps.geo.${this.region}.amazonaws.com/v2/styles/Standard/descriptor` +
      `?key=<KEY>&color-scheme=Light`;

    // ------------------------------------------------------------- outputs
    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${distribution.distributionDomainName}/`,
      description: 'Public map URL (allow ~10 min on first deploy).',
    });
    if (siteDomain) {
      new cdk.CfnOutput(this, 'SiteCustomUrl', {
        value: `https://${siteDomain}/`,
        description: 'Custom domain URL (add a DNS-only CNAME in Cloudflare).',
      });
      new cdk.CfnOutput(this, 'CloudFrontDomain', {
        value: distribution.distributionDomainName,
        description:
          'CNAME target for the custom domain record in Cloudflare.',
      });
    }
    new cdk.CfnOutput(this, 'DataBucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'MapApiKeyName', {
      value: mapKey.keyName,
      description:
        'Amazon Location API key NAME. Get its value with: ' +
        `aws location describe-key --key-name ${mapKey.keyName} ` +
        `--region ${this.region} --query Key --output text`,
    });
    new cdk.CfnOutput(this, 'MapStyleUrlTemplate', {
      value: styleUrlTemplate,
      description:
        'Replace <KEY> with the key value for web/config.js LOCATION_STYLE_URL.',
    });
  }
}
