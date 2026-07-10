import sql from "./src/storage/postgres";

async function run() {
  console.log("Setting 5 to active...");
  await sql`
    UPDATE fingerprints 
    SET status = 'active'
    WHERE id IN (
      SELECT id FROM fingerprints 
      ORDER BY RANDOM() 
      LIMIT 5
    )
  `;

  console.log("Setting 5 to acknowledged...");
  await sql`
    UPDATE fingerprints 
    SET status = 'acknowledged'
    WHERE id IN (
      SELECT id FROM fingerprints 
      WHERE status = 'resolved'
      ORDER BY RANDOM() 
      LIMIT 5
    )
  `;

  console.log("Done.");
  process.exit(0);
}
run();
