#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AirshonketStack } from '../lib/airshonket-stack';

const app = new cdk.App();

new AirshonketStack(app, 'AirshonketStack', {
  // Deploy to the account/region from the active AWS profile.
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description:
    'AirShonket — Bangladesh air quality map. S3 + CloudFront site, ingest ' +
    'Lambda on a schedule, and an Amazon Location Service map API key.',
});
