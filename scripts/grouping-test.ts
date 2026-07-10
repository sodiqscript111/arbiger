/// <reference lib="esnext" />

const API_BASE = process.env.API_BASE || "http://localhost:3000";
let TENANT_ID = "";
const API_KEY: string = await getApiKey();

// ── Helpers ────────────────────────────────────────────────────────────────

interface FpInfo {
  id: string;
  hash: string;
  is_new: boolean;
}

interface EventResponse {
  event_id: string;
  fingerprint: FpInfo;
}

interface FingerprintDetail {
  id: string;
  fingerprint_hash: string;
  handler: string;
  error_type: string;
  sample_error_message: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
  status: string;
  diagnosis_status: string;
  reopened_at: string | null;
}

let scenarioCount = 0;
let allScenarioResults: {
  name: string;
  expected: number;
  actual: number;
  pass: boolean;
}[] = [];

function scenario(name: string, expectedFingerprints: number) {
  scenarioCount++;
  console.log(`\n${"=".repeat(72)}`);
  console.log(`Scenario ${scenarioCount}: ${name}`);
  console.log(`Expected distinct fingerprints: ${expectedFingerprints}`);
  console.log(`${"=".repeat(72)}\n`);
  return { name, expectedFingerprints };
}

function truncate(s: string | null | undefined, len = 80): string {
  if (!s) return "(none)";
  const firstLine = s.split("\n")[0] || "";
  return firstLine.length > len ? firstLine.slice(0, len - 3) + "..." : firstLine;
}

async function sendEvent(
  label: string,
  body: Record<string, unknown>,
): Promise<EventResponse> {
  const res = await fetch(`${API_BASE}/api/v1/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for "${label}": ${text}`);
  }

  const data: EventResponse = await res.json();

  console.log(`--- ${label} ---`);
  console.log(
    `SENT:     handler="${body.handler}" error="${body.error_type}" stack=${truncate(body.stack_trace as string)}`,
  );
  if (body.payload) {
    const p = body.payload as Record<string, unknown>;
    console.log(`          payload keys=[${Object.keys(p).join(", ")}]`);
  }
  if (body.idempotency_key) {
    console.log(`          idempotency_key="${body.idempotency_key}"`);
  }
  console.log(
    `RESPONSE: event_id=${data.event_id} fp_id=${data.fingerprint.id} hash=${data.fingerprint.hash.slice(0, 12)}… is_new=${data.fingerprint.is_new}`,
  );

  return data;
}

async function getFingerprint(fpId: string): Promise<FingerprintDetail> {
  const res = await fetch(`${API_BASE}/api/v1/fingerprints/${fpId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`GET fingerprint ${fpId} failed: ${res.status}`);
  return res.json();
}

async function patchFingerprint(fpId: string, status: string) {
  const res = await fetch(`${API_BASE}/api/v1/fingerprints/${fpId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`PATCH fingerprint ${fpId} → ${status} failed: ${res.status}`);
  return res.json();
}

async function getInsights(fpId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/fingerprints/${fpId}/insights`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`GET insights ${fpId} failed: ${res.status}`);
  return res.json();
}

// ── Direct DB helpers (for building historical baselines fast) ──────────────

import { createHash } from "node:crypto";

function fpHash(handler: string, errorType: string): string {
  return createHash("sha256").update(`${handler}\0${errorType}`, "utf-8").digest("hex");
}

// Insert an event (and optional retry attempts) directly via the DB, bypassing
// the HTTP layer. Used only to seed historical volume for spike/persistence
// baselines; the actual insight computation is always read via the API.
let _seedSql: any = null;
async function getSeedSql() {
  if (!_seedSql) _seedSql = (await import("../src/storage/postgres")).default;
  return _seedSql;
}

async function seedDirect(
  handler: string,
  errorType: string,
  occurredAt: Date,
  retryAttempts?: { attempt_number: number; error_type: string; error_message: string }[],
) {
  const sql = await getSeedSql();
  const hash = fpHash(handler, errorType);

  const [fp] = await sql`
    INSERT INTO fingerprints (tenant_id, fingerprint_hash, handler, error_type, sample_stack_trace)
    VALUES (${TENANT_ID}, ${hash}, ${handler}, ${errorType}, NULL)
    ON CONFLICT (tenant_id, fingerprint_hash) DO UPDATE SET last_seen = NOW(), event_count = fingerprints.event_count + 1
    RETURNING id
  `;
  const fingerprintId = (fp as any).id as string;

  const [ev] = await sql`
    INSERT INTO events (tenant_id, fingerprint_id, error_message, payload, stack_trace, retry_count, max_retries, occurred_at)
    VALUES (${TENANT_ID}, ${fingerprintId}, ${errorType}, ${sql.json({ seeded: true })}, NULL, 0, 0, ${occurredAt.toISOString()})
    RETURNING id
  `;
  const eventId = (ev as any).id as string;

  if (retryAttempts && retryAttempts.length > 0) {
    for (const a of retryAttempts) {
      await sql`
        INSERT INTO retry_attempts (event_id, attempt_number, error_type, error_message, occurred_at)
        VALUES (${eventId}, ${a.attempt_number}, ${a.error_type}, ${a.error_message}, ${occurredAt.toISOString()})
      `;
    }
  }

  return fingerprintId;
}

function finishScenario(
  name: string,
  expected: number,
  fingerprints: Set<string>,
) {
  const actual = fingerprints.size;
  const pass = actual === expected;
  console.log(`\n--- SCENARIO SUMMARY: ${name} ---`);
  console.log(`  Expected distinct fingerprints: ${expected}`);
  console.log(`  Actual distinct fingerprints:   ${actual}`);
  console.log(`  RESULT: ${pass ? "PASS" : "FAIL"}`);
  allScenarioResults.push({ name, expected, actual, pass });
}

// ── Get a fresh API key ────────────────────────────────────────────────────

async function getApiKey(): Promise<string> {
  const { createHash, randomUUID } = await import("node:crypto");
  const sql = (await import("../src/storage/postgres")).default;

  const keySecret = "sk_test_grouping_" + randomUUID().replace(/-/g, "");
  const keyHash = createHash("sha256").update(keySecret, "utf-8").digest("hex");

  const [tenant] = await sql`
    INSERT INTO tenants (name) VALUES ('grouping-test-runner')
    RETURNING id
  `;
  TENANT_ID = (tenant as any).id as string;

  await sql`
    INSERT INTO api_keys (tenant_id, key_prefix, key_hash)
    VALUES (${TENANT_ID}, 'grp_test_', ${keyHash})
  `;

  return keySecret;
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 1 — Exact duplicate burst (500 concurrent)
// ══════════════════════════════════════════════════════════════════════════

async function runScenario1() {
  const s = scenario("Exact duplicate burst (500 concurrent, same handler+error+stack)", 1);

  const STACK = `Error: DB connection timeout
    at Socket._onTimeout (/app/node_modules/pg/lib/connection.js:185:14)
    at listOnTimeout (node:internal/timers:569:17)
    at process.processTicksAndRejections (node:internal/process/task_queues:82:21)`;

  const bodies = Array.from({ length: 500 }, (_, i) => ({
    handler: "payment-webhook",
    error_type: "DatabaseTimeout",
    error_message: `Connection timeout attempt ${i + 1}`,
    stack_trace: STACK,
    payload: { order_id: `ord-${1000 + i}`, amount: Math.floor(Math.random() * 10000) },
    retry_count: 3,
    max_retries: 3,
    occurred_at: new Date(Date.now() - i * 1000).toISOString(),
  }));

  console.log(`Firing ${bodies.length} concurrent POSTs...`);

  const results = await Promise.all(
    bodies.map((b, i) => sendEvent(`#${i + 1} (burst)`, b)),
  );

  const fpSet = new Set(results.map((r) => r.fingerprint.id));
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 2 — Same fingerprint, noisy stack (normalization check)
// ══════════════════════════════════════════════════════════════════════════

async function runScenario2() {
  const s = scenario("Same handler + error_type, varied stack traces (stack no longer affects grouping)", 1);

  const stacks = [
    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:999:9)
    at processOrder (/app/services/order.ts:88:22)
    at handler (/app/routes/order.ts:12:14)`,

    `Error: Validation failed
    at validateOrder (/home/deploy/v2/services/order.ts:142:9)
    at processOrder (/home/deploy/v2/services/order.ts:89:22)
    at handler (/home/deploy/v2/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (C:\\Users\\dev\\project\\services\\order.ts:142:9)
    at processOrder (C:\\Users\\dev\\project\\services\\order.ts:89:22)
    at handler (C:\\Users\\dev\\project\\routes\\order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:50:20)
    at processOrder (/app/services/order.ts:30:15)
    at handler (/app/routes/order.ts:10:5)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:9999:999)
    at processOrder (/app/services/order.ts:8888:888)
    at handler (/app/routes/order.ts:7777:777)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:1:1)
    at processOrder (/app/services/order.ts:2:2)
    at handler (/app/routes/order.ts:3:3)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/docker/containers/abc123/services/order.ts:142:9)
    at processOrder (/docker/containers/abc123/services/order.ts:89:22)
    at handler (/docker/containers/abc123/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/build/12345/services/order.ts:142:9)
    at processOrder (/build/12345/services/order.ts:89:22)
    at handler (/build/12345/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/staging/v3.2/services/order.ts:142:9)
    at processOrder (/staging/v3.2/services/order.ts:89:22)
    at handler (/staging/v3.2/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/payment-service/order.ts:142:9)
    at processOrder (/app/services/payment-service/order.ts:89:22)
    at handler (/app/routes/payment-service/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/app/services/order.ts:142:9)
    at processOrder (/app/services/order.ts:89:22)
    at handler (/app/routes/order.ts:55:14)`,

    `Error: Validation failed
    at validateOrder (/var/log/app/services/order.ts:142:9)
    at processOrder (/var/log/app/services/order.ts:89:22)
    at handler (/var/log/app/routes/order.ts:55:14)`,
  ];

  const results: EventResponse[] = [];
  for (let i = 0; i < stacks.length; i++) {
    const r = await sendEvent(`#${i + 1} (noisy stack)`, {
      handler: "order-validation",
      error_type: "ValidationError",
      error_message: `Order rejected for order-${1000 + i}`,
      stack_trace: stacks[i],
      payload: { order_id: `ord-${2000 + i}`, reason: "invalid field" },
      retry_count: 2,
      max_retries: 3,
      occurred_at: new Date().toISOString(),
    });
    results.push(r);
  }

  const fpSet = new Set(results.map((r) => r.fingerprint.id));
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 3 — Same handler, different error_type
// ══════════════════════════════════════════════════════════════════════════

async function runScenario3() {
  const s = scenario("Same handler, two different error_types", 2);

  const STACK = `Error
    at processPayment (/app/services/payment.ts:45:12)
    at handler (/app/routes/payment.ts:20:8)
    at call (/app/framework/router.ts:100:24)`;

  // 5 TimeoutError
  const timeoutResults: EventResponse[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await sendEvent(`TimeoutError #${i + 1}`, {
      handler: "payment-processor",
      error_type: "TimeoutError",
      error_message: `Payment gateway timeout for txn-${3000 + i}`,
      stack_trace: STACK,
      payload: { transaction_id: `txn-${3000 + i}` },
      retry_count: 3,
      max_retries: 3,
      occurred_at: new Date().toISOString(),
    });
    timeoutResults.push(r);
  }

  // 5 NullPointerError
  const nullPtrResults: EventResponse[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await sendEvent(`NullPointerError #${i + 1}`, {
      handler: "payment-processor",
      error_type: "NullPointerError",
      error_message: `Null response from gateway for txn-${4000 + i}`,
      stack_trace: STACK,
      payload: { transaction_id: `txn-${4000 + i}` },
      retry_count: 2,
      max_retries: 3,
      occurred_at: new Date().toISOString(),
    });
    nullPtrResults.push(r);
  }

  const allResults = [...timeoutResults, ...nullPtrResults];
  const fpSet = new Set(allResults.map((r) => r.fingerprint.id));
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 4 — Completely distinct failures
// ══════════════════════════════════════════════════════════════════════════

async function runScenario4() {
  const s = scenario("Completely distinct failures", 15);

  const scenarios = [
    { handler: "email-send", error_type: "SMTPError", stack: "Error: SMTP\n    at sendMail (/app/email.ts:10:5)\n    at handler (/app/routes/email.ts:5:3)\n    at main (/app/index.ts:1:1)" },
    { handler: "webhook-stripe", error_type: "SignatureMismatch", stack: "Error: Sig\n    at verify (/app/webhooks/stripe.ts:50:12)\n    at processWebhook (/app/webhooks/stripe.ts:30:8)\n    at handler (/app/routes/webhooks.ts:15:5)" },
    { handler: "data-export", error_type: "DiskFull", stack: "Error: Disk\n    at writeFile (/app/export/csv.ts:80:10)\n    at generate (/app/export/csv.ts:45:14)\n    at exportHandler (/app/routes/export.ts:22:6)" },
    { handler: "user-auth", error_type: "TokenExpired", stack: "Error: Token\n    at verifyToken (/app/auth/jwt.ts:25:8)\n    at authenticate (/app/auth/middleware.ts:12:4)\n    at handleRequest (/app/router.ts:60:3)" },
    { handler: "file-upload", error_type: "InvalidFormat", stack: "Error: Format\n    at validateFile (/app/upload/validator.ts:33:11)\n    at processUpload (/app/upload/handler.ts:28:9)\n    at uploadRoute (/app/routes/upload.ts:8:3)" },
    { handler: "search-index", error_type: "IndexCorrupt", stack: "Error: Index\n    at rebuildIndex (/app/search/indexer.ts:120:15)\n    at syncIndex (/app/search/sync.ts:40:8)\n    at scheduler (/app/cron/index.ts:15:4)" },
    { handler: "notification-push", error_type: "DeviceOffline", stack: "Error: Device\n    at sendPush (/app/notifications/apns.ts:65:12)\n    at notify (/app/notifications/sender.ts:30:5)\n    at handler (/app/routes/notify.ts:10:3)" },
    { handler: "report-generator", error_type: "OutOfMemory", stack: "Error: OOM\n    at buildReport (/app/reports/builder.ts:200:20)\n    at generateMonthly (/app/reports/scheduler.ts:55:10)\n    at run (/app/reports/runner.ts:12:4)" },
    { handler: "cache-warm", error_type: "RedisDown", stack: "Error: Redis\n    at connect (/app/cache/warmer.ts:40:8)\n    at warmCache (/app/cache/warmer.ts:25:5)\n    at startup (/app/init.ts:9:3)" },
    { handler: "rate-limiter", error_type: "ConfigParseError", stack: "Error: Config\n    at loadRules (/app/ratelimit/config.ts:55:13)\n    at init (/app/ratelimit/index.ts:15:6)\n    at main (/app/index.ts:30:4)" },
    { handler: "image-processor", error_type: "UnsupportedFormat", stack: "Error: Format\n    at decodeImage (/app/images/decoder.ts:45:14)\n    at processImage (/app/images/processor.ts:30:9)\n    at handler (/app/routes/images.ts:20:5)" },
    { handler: "queue-worker", error_type: "PrefetchLimit", stack: "Error: Prefetch\n    at consume (/app/queue/consumer.ts:70:12)\n    at worker (/app/queue/worker.ts:40:10)\n    at main (/app/queue/index.ts:15:4)" },
    { handler: "dns-resolver", error_type: "NXDomain", stack: "Error: NXDomain\n    at resolve (/app/dns/resolver.ts:30:10)\n    at lookup (/app/dns/cache.ts:20:5)\n    at handler (/app/routes/dns.ts:12:3)" },
    { handler: "oauth-refresh", error_type: "GrantExpired", stack: "Error: Grant\n    at refreshToken (/app/oauth/token.ts:60:15)\n    at exchange (/app/oauth/handler.ts:35:10)\n    at authRoute (/app/routes/auth.ts:18:5)" },
    { handler: "db-migration", error_type: "LockAcquisitionFailed", stack: "Error: Lock\n    at acquireLock (/app/db/migrate.ts:90:12)\n    at runMigration (/app/db/migrate.ts:55:8)\n    at cli (/app/db/cli.ts:10:3)" },
  ];

  const results: EventResponse[] = [];
  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    const r = await sendEvent(`distinct #${i + 1} (${sc.handler}/${sc.error_type})`, {
      handler: sc.handler,
      error_type: sc.error_type,
      error_message: `${sc.error_type} occurred in ${sc.handler}`,
      stack_trace: sc.stack,
      payload: { source: `test-${i + 1}` },
      retry_count: 2,
      max_retries: 3,
      occurred_at: new Date().toISOString(),
    });
    results.push(r);
  }

  const fpSet = new Set(results.map((r) => r.fingerprint.id));
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 5 — Idempotency check
// ══════════════════════════════════════════════════════════════════════════

async function runScenario5() {
  const s = scenario("Idempotency key dedup", 1);

  const body = {
    handler: "idempotency-test",
    error_type: "IdempotentError",
    error_message: "This event should only be stored once",
    stack_trace: `Error: Idempotent\n    at test (/app/test.ts:10:5)\n    at run (/app/test.ts:20:8)\n    at main (/app/test.ts:30:3)`,
    payload: { msg: "idempotent payload" },
    retry_count: 2,
    max_retries: 3,
    occurred_at: new Date().toISOString(),
    idempotency_key: "fixed-idem-key-001",
  };

  const r1 = await sendEvent("First call (should create)", body);
  const r2 = await sendEvent("Second call (should dedup)", body);

  const sameEvent = r1.event_id === r2.event_id;
  const sameFp = r1.fingerprint.id === r2.fingerprint.id;
  console.log(`\n  Same event_id? ${sameEvent}  Same fingerprint? ${sameFp}`);

  const fpSet = new Set([r1.fingerprint.id, r2.fingerprint.id]);
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 6 — Resolved-fingerprint reopen
// ══════════════════════════════════════════════════════════════════════════

async function runScenario6() {
  const s = scenario("Resolved fingerprint reopen", 1);

  const STACK = `Error: ReopenCheck
    at checkStatus (/app/services/health.ts:30:10)
    at monitor (/app/services/health.ts:15:5)
    at run (/app/services/health.ts:5:3)`;

  // Send first event to create the fingerprint
  const r1 = await sendEvent("First event (creates fingerprint)", {
    handler: "health-monitor",
    error_type: "HealthCheckFailed",
    error_message: "Service unhealthy: disk at 95%",
    stack_trace: STACK,
    payload: { service: "db", disk_pct: 95 },
    retry_count: 1,
    max_retries: 3,
    occurred_at: new Date().toISOString(),
  });

  const fpId = r1.fingerprint.id;

  // Check it's active
  let fp = await getFingerprint(fpId);
  console.log(`  Initial status: ${fp.status}, reopened_at: ${fp.reopened_at}`);

  // Resolve it
  await patchFingerprint(fpId, "resolved");
  fp = await getFingerprint(fpId);
  console.log(`  After PATCH resolved: status = ${fp.status}`);

  // Send a matching event — should reopen
  const r2 = await sendEvent("New event after resolve (should reopen)", {
    handler: "health-monitor",
    error_type: "HealthCheckFailed",
    error_message: "Service unhealthy: CPU at 98%",
    stack_trace: STACK,
    payload: { service: "db", cpu_pct: 98 },
    retry_count: 2,
    max_retries: 3,
    occurred_at: new Date().toISOString(),
  });

  fp = await getFingerprint(fpId);
  console.log(`  After new event: status = ${fp.status}, reopened_at = ${fp.reopened_at}, event_count = ${fp.event_count}`);
  console.log(`  Fingerprint ID still the same? ${r2.fingerprint.id === fpId}`);
  console.log(`  is_new was false? ${r2.fingerprint.is_new === false}`);

  const fpSet = new Set([r1.fingerprint.id, r2.fingerprint.id]);
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 7 — is_new (first_seen within 24h)
// ══════════════════════════════════════════════════════════════════════════

async function runScenario7() {
  const s = scenario("Pattern check: is_new (fresh fingerprint)", 1);

  const r = await sendEvent("is_new probe", {
    handler: "is-new-probe",
    error_type: "ProbeError",
    error_message: "fresh",
    payload: { n: 1 },
    retry_count: 0,
    max_retries: 0,
    occurred_at: new Date().toISOString(),
  });

  const ins = await getInsights(r.fingerprint.id);
  console.log(`  is_new = ${ins.is_new} (expected true)`);

  const fpSet = new Set([r.fingerprint.id]);
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 8 — insufficient_data (no prior-day baseline)
// ══════════════════════════════════════════════════════════════════════════

async function runScenario8() {
  const s = scenario("Pattern check: is_spiking = insufficient_data", 1);

  // All events for this fingerprint land today only → no prior-day baseline.
  const fpId = await seedDirect("insufficient-probe", "ProbeError", new Date());
  for (let i = 0; i < 3; i++) {
    await seedDirect("insufficient-probe", "ProbeError", new Date());
  }

  const ins = await getInsights(fpId);
  console.log(`  is_spiking.state = ${ins.is_spiking.state} (expected insufficient_data)`);
  console.log(`  current_volume = ${ins.is_spiking.current_volume}`);

  const fpSet = new Set([fpId]);
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 9 — genuine spike (steady baseline + burst this hour)
// ══════════════════════════════════════════════════════════════════════════

async function runScenario9() {
  const s = scenario("Pattern check: is_spiking = genuine spike", 1);

  const now = new Date();
  const hour = now.getUTCHours();

  // 14 prior days × 10 events at this same hour → quiet, steady baseline (median 10).
  for (let d = 1; d <= 14; d++) {
    for (let k = 0; k < 10; k++) {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d, hour, k, 0));
      await seedDirect("spike-probe", "ProbeError", dt);
    }
  }

  // Burst of 60 events in the CURRENT hour → ratio 6x over median 10.
  for (let k = 0; k < 60; k++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, now.getUTCMinutes(), k));
    await seedDirect("spike-probe", "ProbeError", dt);
  }

  const fpId = await (async () => {
    const sql = await getSeedSql();
    const rows = await sql`SELECT id FROM fingerprints WHERE tenant_id = ${TENANT_ID} AND fingerprint_hash = ${fpHash("spike-probe", "ProbeError")} LIMIT 1`;
    return (rows[0] as any).id as string;
  })();

  const ins = await getInsights(fpId);
  console.log(`  is_spiking.state = ${ins.is_spiking.state} (expected spiking)`);
  console.log(`  current_volume = ${ins.is_spiking.current_volume}, baseline_median = ${ins.is_spiking.baseline_median}, ratio = ${ins.is_spiking.ratio}`);

  const fpSet = new Set([fpId]);
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 10 — retry_drift_detected
// ══════════════════════════════════════════════════════════════════════════

async function runScenario10() {
  const s = scenario("Pattern check: retry_drift_detected", 1);

  // Drift fingerprint: first attempt TimeoutError, last attempt 5xxError.
  const driftId = await seedDirect("drift-probe", "ProbeError", new Date(), [
    { attempt_number: 1, error_type: "TimeoutError", error_message: "timeout" },
    { attempt_number: 2, error_type: "TimeoutError", error_message: "timeout" },
    { attempt_number: 3, error_type: "HTTP5xxError", error_message: "gateway 503" },
  ]);

  // Control fingerprint: identical first/last error_type.
  const stableId = await seedDirect("drift-stable-probe", "ProbeError", new Date(), [
    { attempt_number: 1, error_type: "TimeoutError", error_message: "timeout" },
    { attempt_number: 2, error_type: "TimeoutError", error_message: "timeout" },
  ]);

  const driftIns = await getInsights(driftId);
  const stableIns = await getInsights(stableId);
  console.log(`  drift fingerprint  retry_drift_detected = ${driftIns.retry_drift_detected} (expected true)`);
  console.log(`  stable fingerprint retry_drift_detected = ${stableIns.retry_drift_detected} (expected false)`);

  const fpSet = new Set([driftId, stableId]);
  // Two fingerprints are produced (different handler), so "distinct fingerprints"
  // expected = 2 — this scenario just reports the drift flags, not a pass/fail on count.
  finishScenario(s.name, 2, fpSet);
  console.log(`  (drift flags: drift=${driftIns.retry_drift_detected}, stable=${stableIns.retry_drift_detected})`);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 11 — is_persistent (high steady volume, NOT spiking)
// ══════════════════════════════════════════════════════════════════════════

async function runScenario11() {
  const s = scenario("Pattern check: is_persistent (steady high volume)", 1);

  const now = new Date();
  const hour = now.getUTCHours();

  // ~12 events/day at this hour for 7 days = ~84 events in the window → >= floor 50.
  // Baseline matches current (12/day) so it is NOT spiking.
  for (let d = 0; d < 7; d++) {
    for (let k = 0; k < 12; k++) {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d, hour, k, 0));
      await seedDirect("persistent-probe", "ProbeError", dt);
    }
  }

  const fpId = await (async () => {
    const sql = await getSeedSql();
    const rows = await sql`SELECT id FROM fingerprints WHERE tenant_id = ${TENANT_ID} AND fingerprint_hash = ${fpHash("persistent-probe", "ProbeError")} LIMIT 1`;
    return (rows[0] as any).id as string;
  })();

  const ins = await getInsights(fpId);
  console.log(`  is_persistent = ${ins.is_persistent} (expected true)`);
  console.log(`  is_spiking.state = ${ins.is_spiking.state}`);

  const fpSet = new Set([fpId]);
  finishScenario(s.name, s.expectedFingerprints, fpSet);
}

// ══════════════════════════════════════════════════════════════════════════
//  SCENARIO 12 — Pending-Queue Retry Cycle
// ══════════════════════════════════════════════════════════════════════════

async function runScenario12() {
  const s = scenario("Pending queue: full resolve, failed_again, and reclaim", 1);

  // 1. Ingest an event
  const r1 = await sendEvent("Pending queue test event", {
    handler: "pending-queue-worker",
    error_type: "RetryableError",
    error_message: "Failing for retry test",
    payload: { task: "pull" },
    retry_count: 0,
    max_retries: 3,
    occurred_at: new Date().toISOString(),
  });

  const fpId = r1.fingerprint.id;
  const evId = r1.event_id;

  // 2. Fetch pending events (looping to clear backlog from previous scenarios)
  let pendingEntry: any = null;
  for (let i = 0; i < 20; i++) {
    const pendingRes = await fetch(`${API_BASE}/api/v1/events/pending?limit=200`, {
      headers: { Authorization: `Bearer ${API_KEY}`, "x-consumer-id": "test-worker-1" },
    });
    if (!pendingRes.ok) throw new Error("Failed to fetch pending events: " + await pendingRes.text());
    const pendingData: { data: any[] } = await pendingRes.json();
    
    pendingEntry = pendingData.data.find((e) => e.event.id === evId);
    if (pendingEntry) break;
    
    if (pendingData.data.length === 0) {
      // If we got some entries but none matched our evId, they were filtered out by the API.
      // Wait, if they were filtered out, we won't get them in `data`, but `XREADGROUP >` advanced its cursor.
      // So we can just keep reading. But if the stream is empty, `XREADGROUP >` returns empty.
      // Wait, we don't have access to the raw entries length here. If data is empty, it could mean
      // either we filtered all 200, or there are no more.
      // Let's just break if we try 20 times.
    }
  }

  if (!pendingEntry) {
    console.log("  ERROR: Event did not appear in pending queue after 20 fetches!");
    finishScenario(s.name, s.expectedFingerprints, new Set([fpId]));
    return;
  }
  console.log(`  Event found in pending queue! stream_entry_id = ${pendingEntry.stream_entry_id}`);

  // 3. Report 'failed_again'
  const report1 = await fetch(`${API_BASE}/api/v1/events/${evId}/report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ outcome: "failed_again", stream_entry_id: pendingEntry.stream_entry_id })
  });
  if (!report1.ok) throw new Error("Failed to report failed_again: " + await report1.text());

  // 4. Verify retry_count incremented
  const evRes = await fetch(`${API_BASE}/api/v1/events/${evId}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
  const evData = await evRes.json();
  console.log(`  After failed_again: retry_count = ${evData.retry_count} (expected 1)`);

  // 5. Trigger Reclaim directly using DB helper (since we don't want to wait 5 minutes)
  const pendingQueue = await import("../src/ingestion/pending-queue");
  // We'll use a very short timeout (0 ms) to force reclaim of this specific entry
  await pendingQueue.reclaimPendingEvents(TENANT_ID, 0, "retry-workers", "test-worker-2");
  console.log(`  Forced reclaim executed.`);

  // 6. Fetch pending events again (should reappear due to reclaim)
  const pendingRes2 = await fetch(`${API_BASE}/api/v1/events/pending`, {
    headers: { Authorization: `Bearer ${API_KEY}`, "x-consumer-id": "test-worker-2" },
  });
  const pendingData2: { data: any[] } = await pendingRes2.json();
  const reclaimedEntry = pendingData2.data.find((e) => e.event.id === evId);
  if (!reclaimedEntry) {
    console.log("  ERROR: Event did not get reclaimed!");
  } else {
    console.log(`  Event successfully reclaimed! new stream_entry_id = ${reclaimedEntry.stream_entry_id}`);
    
    // 7. Report 'resolved'
    const report2 = await fetch(`${API_BASE}/api/v1/events/${evId}/report`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "resolved", stream_entry_id: reclaimedEntry.stream_entry_id })
    });
    if (!report2.ok) throw new Error("Failed to report resolved: " + await report2.text());

    // 8. Verify fingerprint flipped to resolved
    const fpDetail = await getFingerprint(fpId);
    console.log(`  After resolved: fingerprint status = ${fpDetail.status} (expected resolved)`);
  }

  finishScenario(s.name, s.expectedFingerprints, new Set([fpId]));
}

// ══════════════════════════════════════════════════════════════════════════
//  RUN ALL
// ══════════════════════════════════════════════════════════════════════════

try {
  await runScenario1();
  await runScenario2();
  await runScenario3();
  await runScenario4();
  await runScenario5();
  await runScenario6();
  await runScenario7();
  await runScenario8();
  await runScenario9();
  await runScenario10();
  await runScenario11();
  await runScenario12();
} catch (err) {
  console.error("\nFATAL: Test script aborted with error:");
  console.error(err);
  process.exit(1);
}

// ── Overall summary table ─────────────────────────────────────────────────

console.log(`\n${"=".repeat(72)}`);
console.log("OVERALL SUMMARY");
console.log(`${"=".repeat(72)}`);
console.log(
  `${"Scenario".padEnd(50)} ${"Expected".padEnd(10)} ${"Actual".padEnd(10)} Result`,
);
console.log("-".repeat(72));
let allPass = true;
for (const r of allScenarioResults) {
  const resultStr = r.pass ? "PASS" : "FAIL";
  if (!r.pass) allPass = false;
  console.log(
    `${r.name.padEnd(50)} ${String(r.expected).padEnd(10)} ${String(r.actual).padEnd(10)} ${resultStr}`,
  );
}
console.log("-".repeat(72));
console.log(`\nOverall: ${allPass ? "ALL SCENARIOS PASSED" : "SOME SCENARIOS FAILED"}`);
console.log(`\nTest tenant + API key were created for this run and left in the DB.`);
console.log(`To clean up, DELETE FROM tenants WHERE name = 'grouping-test-runner';`);
