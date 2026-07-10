import OpenAI from "openai";
import sql from "../storage/postgres";
import type { DiagnosisProvider } from "./diagnosis";

export class OpenAIDiagnosisProvider implements DiagnosisProvider {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzeIncident(tenantId: string, incidentId: string): Promise<void> {
    try {
      
      const incidentRows = await sql`
        SELECT title, root_cause_category, window_start, window_end
        FROM incidents
        WHERE id = ${incidentId} AND tenant_id = ${tenantId}
      `;
      if (incidentRows.length === 0) return;
      const incident = incidentRows[0] as any;

      const fpRows = await sql`
        SELECT f.id, f.handler, f.error_type, i.event_count,
               (SELECT ARRAY_AGG(error_message) FROM (
                 SELECT error_message FROM events e 
                 WHERE e.fingerprint_id = f.id AND e.occurred_at >= ${incident.window_start} AND e.occurred_at <= ${incident.window_end} 
                 ORDER BY occurred_at DESC LIMIT 3
               ) sub) as sample_messages,
               (SELECT stack_trace FROM events e 
                WHERE e.fingerprint_id = f.id AND e.occurred_at >= ${incident.window_start} AND e.occurred_at <= ${incident.window_end} AND stack_trace IS NOT NULL 
                ORDER BY occurred_at DESC LIMIT 1) as sample_stack
        FROM incident_fingerprints i
        JOIN fingerprints f ON f.id = i.fingerprint_id
        WHERE i.incident_id = ${incidentId}
      `;

      if (fpRows.length === 0) return;

      
      const incidentContext = {
        title: incident.title,
        category: incident.root_cause_category,
        fingerprints: fpRows.map((r: any) => ({
          handler: r.handler,
          error_type: r.error_type,
          event_count: r.event_count,
          sample_messages: r.sample_messages || [],
          stack_trace: r.sample_stack || "No stack trace available",
        })),
      };

      const prompt = `
You are an expert SRE and backend engineer. Analyze this incident report containing grouped errors.
Your job is to provide a concise, human-readable summary of what went wrong across these handlers, and suggest a concrete action to fix it.

Incident Data:
\`\`\`json
${JSON.stringify(incidentContext, null, 2)}
\`\`\`

Respond ONLY with a valid JSON object matching this schema:
{
  "ai_summary": "A 2-4 sentence explanation of the root cause. Be technical but clear.",
  "suggested_action": "A 1-2 sentence actionable step the engineering team should take."
}
`;

      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("No content from OpenAI");

      const parsed = JSON.parse(content);

      
      
      await sql`
        UPDATE incidents
        SET root_cause_detail = COALESCE(root_cause_detail, '{}'::jsonb) || ${sql.json({
          ai_summary: parsed.ai_summary,
          suggested_action: parsed.suggested_action
        })}
        WHERE id = ${incidentId} AND tenant_id = ${tenantId}
      `;

      console.log(`[OpenAI] Analyzed incident ${incidentId}`);
    } catch (err) {
      console.error(`[OpenAI] Failed to analyze incident ${incidentId}:`, err);
    }
  }
}
