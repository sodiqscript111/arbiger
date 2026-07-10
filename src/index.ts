import { route } from "./api/router";
import { startReclaimJob } from "./ingestion/reclaim";
import { startCorrelationJob } from "./analysis/correlation-job";
import { OpenAIDiagnosisProvider } from "./providers/openai-diagnosis";

const PORT = parseInt(process.env.PORT || "3000", 10);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}


const diagnosisProvider = process.env.OPENAI_API_KEY 
  ? new OpenAIDiagnosisProvider() 
  : undefined;


startReclaimJob();
startCorrelationJob(diagnosisProvider);

Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
      return withCors(await route(req));
    } catch (err) {
      console.error("Unhandled error:", err);
      return withCors(
        new Response(JSON.stringify({ error: "internal server error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );
    }
  },
});

console.log(`arbiger listening on http:
