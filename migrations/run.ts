import sql from "../src/storage/postgres";
import { resolve } from "path";

async function migrate() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: bun run migrations/run.ts <sql-file>");
    process.exit(1);
  }

  const fullPath = resolve(process.cwd(), file);
  const body = await Bun.file(fullPath).text();

  console.log(`Running migration: ${file}`);
  await sql.unsafe(body);
  console.log("Migration complete.");
  await sql.end();
}

await migrate();
