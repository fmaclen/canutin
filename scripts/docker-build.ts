#!/usr/bin/env bun
import { $ } from 'bun';
import { POCKETBASE_VERSION } from './pb-server.js';

const version = process.argv[2] || 'latest';
const registry = 'ghcr.io';
const image = 'canutin';

console.log(`Building Docker image with PocketBase ${POCKETBASE_VERSION}`);

await $`docker build \
  --build-arg POCKETBASE_VERSION=${POCKETBASE_VERSION} \
  --platform linux/amd64,linux/arm64 \
  -t ${registry}/${image}:${version} \
  .`;
