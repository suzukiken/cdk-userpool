#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkuserpoolStack } from '../lib/cdkuserpool-stack';

const STAGE = 'trial'
const NAME = 'cdkuserpool'

const NAME_PREFIX = NAME + '-' + STAGE + '-'
const STACK_NAME = NAME_PREFIX + 'stack'

const app = new cdk.App();
new CdkuserpoolStack(app, STACK_NAME, {
    name_prefix: NAME_PREFIX
})
