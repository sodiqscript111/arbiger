/// <reference lib="esnext" />
import { createHash, randomUUID } from "node:crypto";

const API_BASE = process.env.API_BASE || "http://localhost:3000";
let TENANT_ID = "d91c3687-6db4-4d82-b713-66ca4cac11c0";
const API_KEY: string = process.env.API_KEY || "";

// ── Setup ──────────────────────────────────────────────────────────────────


async function fetchApi(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

function printBlock(title: string) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(` ${title}`);
  console.log(`${"=".repeat(72)}`);
}

// ── 1. Ingestion ───────────────────────────────────────────────────────────

printBlock("SENT (Ingestion Phase)");

const fingerprintSet = new Set<string>();
const sentEvents: { id: string; handler: string, error_type: string }[] = [];

async function ingest(handler: string, error_type: string, error_message: string, payload: any) {
  const data = await fetchApi("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      handler,
      error_type,
      error_message,
      payload,
      occurred_at: new Date().toISOString(),
      retry_count: 0,
      max_retries: 3
    })
  });
  fingerprintSet.add(data.fingerprint.id);
  sentEvents.push({ id: data.event_id, handler, error_type });
  console.log(`[SENT] ${handler} | ${error_type} | fp_id: ${data.fingerprint.id} | event_id: ${data.event_id}`);
  return data;
}

const H_PAYMENT = `process-payment`;
const H_INVENTORY = `check-inventory`;
const H_NOTIF = `send-order-confirmation`;
const H_DISCOUNT = `apply-discount-code`;

// 1. process-payment (3-4 events, varying payload)
await ingest(H_PAYMENT, "PaymentProviderTimeout", "Payment provider did not respond within 10s", { order_id: "ORD-001", amount: 150.0, customer_id: "CUST-A" });
await ingest(H_PAYMENT, "PaymentProviderTimeout", "Payment provider did not respond within 10s", { order_id: "ORD-002", amount: 25.5, customer_id: "CUST-B" });
await ingest(H_PAYMENT, "PaymentProviderTimeout", "Payment provider did not respond within 10s", { order_id: "ORD-003", amount: 99.99, customer_id: "CUST-C" });

// 2. check-inventory (2 events)
await ingest(H_INVENTORY, "OutOfStockError", "Item 4F21 shows in stock but reservation failed", { order_id: "ORD-004", item: "4F21" });
await ingest(H_INVENTORY, "OutOfStockError", "Item 4F21 shows in stock but reservation failed", { order_id: "ORD-005", item: "4F21" });

// 3. send-order-confirmation (1 event)
await ingest(H_NOTIF, "NotificationDeliveryFailed", "SMS provider rejected number format", { order_id: "ORD-001", phone: "+10000000000" });

// 4. apply-discount-code (1 event)
await ingest(H_DISCOUNT, "DiscountCodeExpired", "Promo code SUMMER25 has expired", { cart_id: "CART-99", code: "SUMMER25" });

console.log(`\n-> Created ${fingerprintSet.size} distinct fingerprints (Expected: 4)`);
if (fingerprintSet.size !== 4) throw new Error("Fingerprint count mismatch!");


// ── 3. Wait 5 seconds ──────────────────────────────────────────────────────

printBlock("WAIT");
console.log("Waiting 5 seconds before worker picks up...");
await new Promise(r => setTimeout(r, 5000));
console.log("Wait complete.");


// ── 4 & 5. Pull pending events ─────────────────────────────────────────────

printBlock("PULLED (Worker fetching from stream)");

let pulledEvents: any[] = [];
for (let i = 0; i < 5; i++) {
  const pendingData = await fetchApi("/api/v1/events/pending?limit=100", {
    headers: { "x-consumer-id": "ecommerce-retry-worker-1" }
  });
  if (pendingData.data.length === 0) break;
  pulledEvents.push(...pendingData.data);
}

if (pulledEvents.length === 0) {
  throw new Error("No pending events were pulled!");
}

for (const entry of pulledEvents) {
  const original = sentEvents.find(s => s.id === entry.event.id);
  console.log(`[PULLED] ${original?.handler || 'unknown'} | msg: "${entry.event.error_message}"`);
}


// ── 6 & 7. Report Outcomes ─────────────────────────────────────────────────

printBlock("REPORTED (Worker finishes attempts)");

const paymentEvents = pulledEvents.filter(e => e.event.error_message.includes("Payment provider"));
for (const entry of paymentEvents) {
  await fetchApi(`/api/v1/events/${entry.event.id}/report`, {
    method: "POST",
    body: JSON.stringify({ outcome: "resolved", stream_entry_id: entry.stream_entry_id })
  });
  console.log(`[REPORTED] 'resolved' for process-payment event ${entry.event.id}`);
}

const inventoryEvents = pulledEvents.filter(e => e.event.error_message.includes("Item 4F21"));
if (inventoryEvents.length > 0) {
  // just report all of them as failed again to clear PEL for the test
  for (const inv of inventoryEvents) {
    await fetchApi(`/api/v1/events/${inv.event.id}/report`, {
      method: "POST",
      body: JSON.stringify({ outcome: "failed_again", stream_entry_id: inv.stream_entry_id })
    });
  }
  console.log(`[REPORTED] 'failed_again' for check-inventory events`);
}


// ── 8. Verification Checks ─────────────────────────────────────────────────

printBlock("VERIFIED (Assertions)");

let allPassed = true;
const assertions: any[] = [];
function assert(name: string, condition: boolean) {
  assertions.push({ name, pass: condition });
  console.log(`[${condition ? "PASS" : "FAIL"}] ${name}`);
  if (!condition) allPassed = false;
}

const allFps = await fetchApi("/api/v1/fingerprints?limit=100");
const processPaymentFp = allFps.data.find((f: any) => f.handler === H_PAYMENT);
assert("process-payment fingerprint is resolved", processPaymentFp?.status === "resolved");

const checkInventoryFp = allFps.data.find((f: any) => f.handler === H_INVENTORY);
assert("check-inventory fingerprint is active", checkInventoryFp?.status === "active");

if (inventoryEvents.length > 0) {
  const inventoryEventId = inventoryEvents[0].event.id;
  const evData = await fetchApi(`/api/v1/events/${inventoryEventId}`);
  assert("check-inventory event retry_count > 0", evData.retry_count > 0);
}

const pendingQueue = await import("../src/ingestion/pending-queue");
await pendingQueue.reclaimPendingEvents(TENANT_ID, 0, "retry-workers", "ecommerce-retry-worker-3");
const pendingData3 = await fetchApi("/api/v1/events/pending?limit=100", {
    headers: { "x-consumer-id": "ecommerce-retry-worker-3" }
});
const foundCheckInventory = pendingData3.data.some((e: any) => e.event.error_message.includes("Item 4F21"));
assert("check-inventory event is still pullable (via reclaim)", foundCheckInventory);

const notifFp = allFps.data.find((f: any) => f.handler === H_NOTIF);
const discFp = allFps.data.find((f: any) => f.handler === H_DISCOUNT);
assert("send-order-confirmation fingerprint is active", notifFp?.status === "active");
assert("apply-discount-code fingerprint is active", discFp?.status === "active");

// ── 9. Final Summary Table ─────────────────────────────────────────────────

printBlock("FINAL STATE SUMMARY");

const finalFps = (await fetchApi("/api/v1/fingerprints?limit=100")).data;

console.log(`${"Fingerprint Hash".padEnd(20)} | ${"Handler".padEnd(25)} | ${"Status".padEnd(10)} | ${"Events".padEnd(6)} | ${"Expected".padEnd(10)} | Result`);
console.log("-".repeat(95));

for (const fp of finalFps) {
  let expected = "active";
  if (fp.handler === H_PAYMENT) expected = "resolved";
  
  const hash = fp.fingerprint_hash.substring(0, 18);
  const result = fp.status === expected ? "PASS" : "FAIL";
  
  console.log(`${hash.padEnd(20)} | ${fp.handler.padEnd(25)} | ${fp.status.padEnd(10)} | ${String(fp.event_count).padEnd(6)} | ${expected.padEnd(10)} | ${result}`);
}

console.log("\nCleaning up connections...");
const sql = (await import("../src/storage/postgres")).default;
const redis = (await import("../src/storage/redis")).default;
await sql.end();
redis.disconnect();

if (!allPassed) {
  process.exit(1);
}
