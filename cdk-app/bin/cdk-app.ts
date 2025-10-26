#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { IdpStack } from '../lib/idp-stack';

const app = new cdk.App();
new IdpStack(app, 'IdpStack102620251713', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});