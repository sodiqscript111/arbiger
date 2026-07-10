import sql from "./src/storage/postgres";

async function run() {
  console.log("Resolving a subset of fingerprints to populate the UI...");
  const res = await sql`
    UPDATE fingerprints 
    SET status = 'resolved'
    WHERE id IN (
      SELECT id FROM fingerprints 
      WHERE status != 'resolved' 
      ORDER BY RANDOM() 
      LIMIT 20
    )
    RETURNING id
  `;
  console.log(`Resolved ${res.length} fingerprints.`);
  process.exit(0);
}
run();
