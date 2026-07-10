import postgres from "postgres";

const sql = postgres({
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5433", 10),
  database: process.env.PG_DATABASE || "postgres",
  username: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "postgres",

  max: parseInt(process.env.PG_POOL_SIZE || "10", 10),
  idle_timeout: 30,
  connect_timeout: 10,
});

export default sql;
