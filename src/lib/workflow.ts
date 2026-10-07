import { generateText, Output } from "ai";
import { z } from "zod";
import { db } from "./db";

export const leadInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  company: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(50).optional().default(""),
  companySize: z.coerce.number().int().min(1).max(100000).optional(),
  serviceNeeded: z.string().trim().min(2).max(120),
  budgetRange: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().min(15).max(5000),
  idempotencyKey: z.string().uuid()
});

export const analysisSchema = z.object({
  category: z.string().min(2).max(80),
  requestType: z.string().min(2).max(80),
  urgency: z.enum(["High", "Normal", "Low"]),
  estimatedValue: z.enum(["High", "Medium", "Low", "Unknown"]),
  department: z.enum(["Sales", "Solutions", "Operations", "Support", "General"]),
  priority: z.enum(["High", "Normal", "Low"]),
  summary: z.string().min(10).max(700),
  recommendedAction: z.string().min(10).max(300)
});

export type LeadInput = z.infer<typeof leadInputSchema>;
export type Analysis = z.infer<typeof analysisSchema>;

const stepNames: Record<string, string> = {
  lead_received: "Lead received",
  database_save: "Database save",
  ai_analysis: "AI analysis",
  crm_record: "CRM record created",
  customer_email: "Customer confirmation",
  manager_notification: "Manager notification",
  follow_up: "Follow-up scheduled"
};

export function fallbackAnalysis(input: Pick<LeadInput, "companySize" | "serviceNeeded" | "message" | "budgetRange">): Analysis {
  const text = `${input.serviceNeeded} ${input.message}`.toLowerCase();
  const crm = /\bcrm\b|salesforce|hubspot|pipeline|customer relationship/.test(text);
  const automation = /automat|workflow|zapier|make\.com|n8n|integration/.test(text);
  const urgent = /urgent|asap|immediately|this week|before january|deadline/.test(text);
  const large = (input.companySize ?? 0) >= 30;
  const highBudget = /\$?25k|\$?50k|25,000|50,000|enterprise|50k\+/.test((input.budgetRange ?? "").toLowerCase());

  const category = crm ? "CRM Implementation" : automation ? "Workflow Automation" : "Business Systems";
  const priority = urgent || large || highBudget ? "High" : (input.companySize ?? 0) <= 5 ? "Low" : "Normal";
  return {
    category,
    requestType: crm ? "Implementation" : automation ? "Automation Build" : "Consultation",
    urgency: urgent ? "High" : "Normal",
    estimatedValue: highBudget || large ? "High" : priority === "Low" ? "Low" : "Medium",
    department: crm || automation ? "Solutions" : "Sales",
    priority,
    summary: `Fallback review: ${input.serviceNeeded} request from a ${input.companySize ?? "size-unknown"} person company. Manual validation is recommended because AI analysis was unavailable.`,
    recommendedAction: priority === "High" ? "Review manually and schedule a discovery call within 2 hours." : "Review manually during the next business day."
  };
}

export function followUpHours(priority: Analysis["priority"]) {
  if (priority === "High") return 2;
  if (priority === "Low") return 48;
  return 24;
}

export async function analyseLead(input: LeadInput): Promise<Analysis> {
  if (process.env.SIMULATE_AI_FAILURE === "1") throw new Error("Simulated AI failure");
  if (process.env.LIVE_AI_ENABLED !== "1") throw new Error("Live AI provider is not configured; deterministic fallback is active.");

  const model = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-nano";
  const { output } = await generateText({
    model,
    output: Output.object({ schema: analysisSchema }),
    prompt: `Classify this B2B inbound lead for an operations team. Use the schema exactly.

Lead:
${JSON.stringify({
  company: input.company,
  companySize: input.companySize,
  serviceNeeded: input.serviceNeeded,
  budgetRange: input.budgetRange,
  message: input.message
})}`
  });

  return analysisSchema.parse(output);
}

async function setStep(runId: string, key: string, status: "Pending" | "Running" | "Completed" | "Failed" | "Skipped", data: {
  attempt?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  output?: string | null;
} = {}) {
  const sql = db();
  const attempt = data.attempt ?? 1;
  const existing = await sql`SELECT id FROM workflow_steps WHERE run_id=${runId} AND step_key=${key} AND attempt=${attempt}`;
  if (existing.length === 0) {
    await sql`INSERT INTO workflow_steps (run_id, step_key, step_name, status, attempt, started_at)
      VALUES (${runId}, ${key}, ${stepNames[key]}, ${status}, ${attempt}, CASE WHEN ${status}='Running' THEN now() ELSE NULL END)`;
  } else {
    await sql`UPDATE workflow_steps SET
      status=${status},
      started_at=CASE WHEN ${status}='Running' AND started_at IS NULL THEN now() ELSE started_at END,
      completed_at=CASE WHEN ${status} IN ('Completed','Failed','Skipped') THEN now() ELSE completed_at END,
      error_code=${data.errorCode ?? null},
      error_message=${data.errorMessage ?? null},
      output_summary=${data.output ?? null}
      WHERE run_id=${runId} AND step_key=${key} AND attempt=${attempt}`;
  }
}

export async function startLeadWorkflow(input: LeadInput) {
  const sql = db();
  const result = await sql.begin(async tx => {
    const inserted = await tx`
      INSERT INTO leads (idempotency_key,name,company,email,phone,company_size,service_needed,budget_range,message,workflow_state)
      VALUES (${input.idempotencyKey},${input.name},${input.company},${input.email},${input.phone || null},${input.companySize ?? null},${input.serviceNeeded},${input.budgetRange || null},${input.message},'Running')
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) {
      const prior = await tx`SELECT id FROM leads WHERE idempotency_key=${input.idempotencyKey} LIMIT 1`;
      return { leadId: String(prior[0].id), runId: "", duplicate: true };
    }

    const leadId = String(inserted[0].id);
    const runRows = await tx`INSERT INTO workflow_runs (lead_id, trigger, status) VALUES (${leadId},'public_form','Running') RETURNING id`;
    const runId = String(runRows[0].id);
    const steps = Object.entries(stepNames);
    for (const [key, name] of steps) {
      await tx`INSERT INTO workflow_steps (run_id,step_key,step_name,status) VALUES (${runId},${key},${name},'Pending')`;
    }
    await tx`UPDATE workflow_steps SET status='Completed',started_at=now(),completed_at=now(),output_summary='Validated public form payload.' WHERE run_id=${runId} AND step_key='lead_received'`;
    await tx`UPDATE workflow_steps SET status='Completed',started_at=now(),completed_at=now(),output_summary='Lead persisted with idempotency protection.' WHERE run_id=${runId} AND step_key='database_save'`;
    return { leadId, runId, duplicate: false };
  });

  if (result.duplicate) return result;
  try {
    await continueWorkflow(result.runId, result.leadId, input);
    return { ...result, workflowFailed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected workflow failure";
    try {
      await sql`UPDATE workflow_runs SET status='Failed',completed_at=now(),
        duration_ms=GREATEST(0,(EXTRACT(EPOCH FROM (now()-started_at))*1000)::int),error_summary=${message}
        WHERE id=${result.runId}`;
      await sql`UPDATE leads SET workflow_state='Failed',updated_at=now() WHERE id=${result.leadId}`;
      await sql`UPDATE workflow_steps SET status='Failed',completed_at=now(),error_code='UNEXPECTED_WORKFLOW_ERROR',
        error_message=${message} WHERE run_id=${result.runId} AND status='Running'`;
      await sql`INSERT INTO notifications (lead_id,type,title,body,dedupe_key)
        VALUES (${result.leadId},'workflow_failed','Workflow failed','The lead is saved, but automation needs manual review.',${`workflow:${result.runId}:unexpected`})
        ON CONFLICT (dedupe_key) DO NOTHING`;
    } catch {
      // The lead was committed before automation started; a persistent database outage may prevent failure logging.
    }
    return { ...result, workflowFailed: true };
  }
}

async function continueWorkflow(runId: string, leadId: string, input: LeadInput) {
  const sql = db();
  let hadFailure = false;
  let analysis: Analysis;

  await setStep(runId, "ai_analysis", "Running");
  try {
    analysis = await analyseLead(input);
    await sql`UPDATE leads SET
      category=${analysis.category}, request_type=${analysis.requestType}, urgency=${analysis.urgency},
      estimated_value=${analysis.estimatedValue}, department=${analysis.department}, priority=${analysis.priority},
      ai_summary=${analysis.summary}, recommended_action=${analysis.recommendedAction}, ai_status='completed', updated_at=now()
      WHERE id=${leadId}`;
    await setStep(runId, "ai_analysis", "Completed", { output: `${analysis.category} · ${analysis.priority} priority` });
  } catch (error) {
    hadFailure = true;
    analysis = fallbackAnalysis(input);
    const message = error instanceof Error ? error.message : "Unknown AI error";
    await sql`UPDATE leads SET
      category=${analysis.category}, request_type=${analysis.requestType}, urgency=${analysis.urgency},
      estimated_value=${analysis.estimatedValue}, department=${analysis.department}, priority=${analysis.priority},
      ai_summary=${analysis.summary}, recommended_action=${analysis.recommendedAction}, ai_status='fallback', updated_at=now()
      WHERE id=${leadId}`;
    await setStep(runId, "ai_analysis", "Failed", { errorCode: "AI_ANALYSIS_FAILED", errorMessage: message, output: "Fallback classification applied; manual review required." });
    await sql`INSERT INTO notifications (lead_id,type,title,body,dedupe_key)
      VALUES (${leadId},'workflow_failed','AI analysis needs review','The lead was saved and classified with fallback rules.',${`workflow:${runId}:ai`})
      ON CONFLICT (dedupe_key) DO NOTHING`;
  }

  await setStep(runId, "crm_record", "Running");
  await setStep(runId, "crm_record", "Completed", { output: "Lead is available in the internal CRM pipeline." });

  await setStep(runId, "customer_email", "Running");
  await sql`INSERT INTO email_outbox (lead_id,email_type,to_email,subject,body,status,dedupe_key)
    VALUES (${leadId},'customer_confirmation',${input.email},'We received your request','Thanks — we received your request. Our team will review it shortly.','pending_setup',${`lead:${leadId}:customer_confirmation`})
    ON CONFLICT (dedupe_key) DO NOTHING`;
  await setStep(runId, "customer_email", "Skipped", { output: "Email provider is not configured. Message stored in outbox as pending setup." });

  await setStep(runId, "manager_notification", "Running");
  const notificationType = analysis.priority === "High" ? "high_priority" : "system";
  await sql`INSERT INTO notifications (lead_id,type,title,body,dedupe_key)
    VALUES (${leadId},${notificationType},${analysis.priority === "High" ? "New high-priority lead" : "New lead received"},${`${input.company}: ${analysis.category}`},${`lead:${leadId}:manager`})
    ON CONFLICT (dedupe_key) DO NOTHING`;
  await setStep(runId, "manager_notification", "Completed", { output: "Internal dashboard notification created." });

  await setStep(runId, "follow_up", "Running");
  const hours = followUpHours(analysis.priority);
  await sql`INSERT INTO follow_ups (lead_id,kind,due_at,reason)
    VALUES (${leadId},'initial',now() + ${`${hours} hours`}::interval,${`${analysis.priority} priority rule: follow up within ${hours} hours.`})
    ON CONFLICT (lead_id,kind) DO NOTHING`;
  await setStep(runId, "follow_up", "Completed", { output: `Follow-up due in ${hours} hours.` });

  const status = hadFailure ? "Partially Completed" : "Completed";
  await sql`UPDATE workflow_runs SET status=${status}, completed_at=now(),
    duration_ms=GREATEST(0, (EXTRACT(EPOCH FROM (now()-started_at))*1000)::int),
    error_summary=${hadFailure ? "AI analysis failed; fallback classification applied." : null}
    WHERE id=${runId}`;
  await sql`UPDATE leads SET workflow_state=${status}, pipeline_stage=CASE WHEN ${hadFailure} THEN 'New' ELSE 'Qualified' END, updated_at=now() WHERE id=${leadId}`;
}

export async function retryWorkflow(runId: string) {
  const sql = db();

  // Atomic claim: only one request can move a retryable run back to Running.
  // Rapid double-clicks therefore cannot execute the same failed business step twice.
  const claimed = await sql`
    UPDATE workflow_runs
    SET status='Running', retry_count=retry_count+1, completed_at=NULL, error_summary=NULL
    WHERE id=${runId}
      AND retry_count < 3
      AND status IN ('Failed','Partially Completed')
    RETURNING id,lead_id,retry_count
  `;

  if (claimed.length === 0) {
    const rows = await sql`SELECT status,retry_count FROM workflow_runs WHERE id=${runId} LIMIT 1`;
    if (rows.length === 0) throw new Error("Workflow not found.");
    if (Number(rows[0].retry_count) >= 3) {
      await sql`UPDATE workflow_runs
        SET error_summary='Retry limit reached. Manual intervention is required.'
        WHERE id=${runId} AND status IN ('Failed','Partially Completed')`;
      throw new Error("Retry limit reached.");
    }
    if (String(rows[0].status) === "Running") throw new Error("Retry already in progress.");
    return;
  }

  const retryNumber = Number(claimed[0].retry_count);

  try {
    const runs = await sql`
      SELECT wr.*, l.name,l.company,l.email,l.phone,l.company_size,l.service_needed,l.budget_range,
        l.message,l.idempotency_key,l.priority
      FROM workflow_runs wr
      JOIN leads l ON l.id=wr.lead_id
      WHERE wr.id=${runId}
      LIMIT 1
    `;
    const run = runs[0];

    const latest = await sql`
      SELECT DISTINCT ON (step_key) step_key,status,attempt
      FROM workflow_steps
      WHERE run_id=${runId}
      ORDER BY step_key, attempt DESC
    `;
    const failed = new Map(
      latest
        .filter(step => String(step.status) === "Failed")
        .map(step => [String(step.step_key), Number(step.attempt)])
    );

    if (failed.size === 0) {
      await sql`UPDATE workflow_runs SET status='Completed',completed_at=now(),error_summary=NULL WHERE id=${runId}`;
      await sql`UPDATE leads SET workflow_state='Completed',updated_at=now() WHERE id=${run.lead_id}`;
      return;
    }

    let stillFailed = false;

    if (failed.has("ai_analysis")) {
      const attempt = failed.get("ai_analysis")! + 1;
      await setStep(runId, "ai_analysis", "Running", { attempt });
      const input: LeadInput = {
        idempotencyKey: String(run.idempotency_key),
        name: String(run.name),
        company: String(run.company),
        email: String(run.email),
        phone: String(run.phone ?? ""),
        companySize: run.company_size ? Number(run.company_size) : undefined,
        serviceNeeded: String(run.service_needed),
        budgetRange: String(run.budget_range ?? ""),
        message: String(run.message)
      };

      try {
        const analysis = await analyseLead(input);
        await sql`UPDATE leads SET
          category=${analysis.category},request_type=${analysis.requestType},urgency=${analysis.urgency},
          estimated_value=${analysis.estimatedValue},department=${analysis.department},priority=${analysis.priority},
          ai_summary=${analysis.summary},recommended_action=${analysis.recommendedAction},
          ai_status='completed',updated_at=now()
          WHERE id=${run.lead_id}`;
        await setStep(runId, "ai_analysis", "Completed", {
          attempt,
          output: `Retry succeeded: ${analysis.category} · ${analysis.priority}`
        });

        const hours = followUpHours(analysis.priority);
        await sql`UPDATE follow_ups SET
          due_at=now() + ${`${hours} hours`}::interval,
          reason=${`${analysis.priority} priority rule after AI retry: follow up within ${hours} hours.`}
          WHERE lead_id=${run.lead_id} AND kind='initial' AND status='open'`;
      } catch (error) {
        stillFailed = true;
        await setStep(runId, "ai_analysis", "Failed", {
          attempt,
          errorCode:"AI_ANALYSIS_FAILED",
          errorMessage:error instanceof Error ? error.message : "Unknown AI error",
          output:"Fallback data remains active."
        });
      }
    }

    if (failed.has("crm_record")) {
      const attempt = failed.get("crm_record")! + 1;
      await setStep(runId, "crm_record", "Running", { attempt });
      await setStep(runId, "crm_record", "Completed", {
        attempt,
        output: "Lead already exists in the internal CRM; no duplicate record was created."
      });
    }

    if (failed.has("manager_notification")) {
      const attempt = failed.get("manager_notification")! + 1;
      await setStep(runId, "manager_notification", "Running", { attempt });
      const type = String(run.priority) === "High" ? "high_priority" : "system";
      await sql`INSERT INTO notifications (lead_id,type,title,body,dedupe_key)
        VALUES (
          ${run.lead_id},
          ${type},
          ${type === "high_priority" ? "New high-priority lead" : "New lead received"},
          ${`${String(run.company)} requires manager review.`},
          ${`lead:${String(run.lead_id)}:manager`}
        )
        ON CONFLICT (dedupe_key) DO NOTHING`;
      await setStep(runId, "manager_notification", "Completed", {
        attempt,
        output: "Internal notification confirmed without duplication."
      });
    }

    if (failed.has("follow_up")) {
      const attempt = failed.get("follow_up")! + 1;
      await setStep(runId, "follow_up", "Running", { attempt });
      const hours = followUpHours(String(run.priority) as Analysis["priority"]);
      await sql`INSERT INTO follow_ups (lead_id,kind,due_at,reason)
        VALUES (
          ${run.lead_id},
          'initial',
          now() + ${`${hours} hours`}::interval,
          ${`${String(run.priority)} priority retry rule: follow up within ${hours} hours.`}
        )
        ON CONFLICT (lead_id,kind) DO NOTHING`;
      await setStep(runId, "follow_up", "Completed", {
        attempt,
        output: "Existing follow-up reused or missing follow-up created once."
      });
    }

    if (failed.has("customer_email")) {
      const attempt = failed.get("customer_email")! + 1;
      await setStep(runId, "customer_email", "Failed", {
        attempt,
        errorCode: "EMAIL_PROVIDER_UNAVAILABLE",
        errorMessage: "No production email provider is configured.",
        output: "No email sent. The existing outbox event was not duplicated."
      });
      stillFailed = true;
    }

    const handled = new Set(["ai_analysis","crm_record","manager_notification","follow_up","customer_email"]);
    for (const [key, previousAttempt] of failed) {
      if (handled.has(key)) continue;
      const attempt = previousAttempt + 1;
      await setStep(runId, key, "Failed", {
        attempt,
        errorCode: "MANUAL_INTERVENTION_REQUIRED",
        errorMessage: "This step cannot be safely replayed automatically.",
        output: "No business operation was repeated."
      });
      stillFailed = true;
    }

    const finalStatus = stillFailed ? "Partially Completed" : "Completed";
    await sql`UPDATE workflow_runs SET
      status=${finalStatus},
      error_summary=${stillFailed ? "One or more retried steps still require attention." : null},
      completed_at=now()
      WHERE id=${runId}`;
    await sql`UPDATE leads SET workflow_state=${finalStatus},updated_at=now() WHERE id=${run.lead_id}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected retry failure";
    await sql`UPDATE workflow_runs SET
      status='Partially Completed',
      completed_at=now(),
      error_summary=${`Retry ${retryNumber} failed: ${message}`}
      WHERE id=${runId}`;
    await sql`UPDATE leads SET workflow_state='Partially Completed',updated_at=now()
      WHERE id=${claimed[0].lead_id}`;
    await sql`INSERT INTO notifications (lead_id,type,title,body,dedupe_key)
      VALUES (
        ${claimed[0].lead_id},
        'workflow_failed',
        'Workflow retry needs review',
        ${`Retry ${retryNumber} failed safely. Previous completed actions were preserved.`},
        ${`workflow:${runId}:retry:${retryNumber}:failed`}
      )
      ON CONFLICT (dedupe_key) DO NOTHING`;
    throw error;
  }
}
