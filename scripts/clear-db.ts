import sql from "../src/storage/postgres";
import redis from "../src/storage/redis";

async function clear() {
  console.log("Clearing Postgres...");
  await sql`DELETE FROM tenants`;
  console.log("Clearing Redis...");
  await redis.flushall();
  console.log("Done.");
  process.exit(0);
}

clear();
