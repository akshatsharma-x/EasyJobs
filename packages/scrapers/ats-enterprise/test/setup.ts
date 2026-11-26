// Offline tests run without politeness delays (guarded by VITEST inside src/lib/http.ts).
// LIVE=1 smoke tests keep real delays.
if (process.env.LIVE !== "1") process.env.ATS_ENTERPRISE_TEST_NO_DELAY = "1";
process.env.ATS_ENTERPRISE_STATE_DIR ??= "off";
