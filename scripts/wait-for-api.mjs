#!/usr/bin/env node
/** Waits (≤ 2 min) until GET $API_URL/health answers { ok: true }. */
import { apiUrl, loadRootEnv, waitForApi } from "./env.mjs";

loadRootEnv();
if (!(await waitForApi())) {
  console.error(`API not healthy at ${apiUrl()} after 2 min`);
  process.exit(1);
}
