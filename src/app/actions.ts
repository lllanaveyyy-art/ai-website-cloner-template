"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authenticate, clearSession, requireSession, setSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadInputSchema, retryWorkflow, startLeadWorkflow } from "@/lib/workflow";

export type ActionState = { ok: boolean; message: string };

export async function submitLead(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = leadInputSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    companySize: formData.get("companySize") || undefined,
    serviceNeeded: formData.get("serviceNeeded"),
    budgetRange: formData.get("budgetRange"),
    message: formData.get("message"),
    idempotencyKey: formData.get("idempotencyKey")
  });

  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the form." };

  try {
    const result = await startLeadWorkflow(parsed.data);
    return {
      ok: true,
      message: result.duplicate ? "We already received this request. No duplicate was created." : "Thanks — your request was received and added to the workflow."
    };
  } catch {
    return { ok: false, message: "Your request could not be processed right now. Your entries were kept; please retry." };
  }
}

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const session = authenticate(email, password);
  if (!session) return { ok: false, message: "Invalid email or password." };
  await setSession(session.email, session.role);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function updateLeadAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const priority = String(formData.get("priority") ?? "");
  const category = String(formData.get("category") ?? "").trim();
  const stage = String(formData.get("pipelineStage") ?? "");
  if (!id || !["High","Normal","Low"].includes(priority) || !["New","Qualified","Contacted","Discovery","Proposal","Won","Lost"].includes(stage) || category.length < 2) return;
  await db()`UPDATE leads SET priority=${priority},category=${category},pipeline_stage=${stage},updated_at=now() WHERE id=${id}`;
  revalidatePath(`/dashboard/leads/${id}`);
  revalidatePath("/dashboard");
}

export async function addNoteAction(formData: FormData) {
  const session = await requireSession();
  const leadId = String(formData.get("leadId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!leadId || !content || content.length > 4000) return;
  await db()`INSERT INTO notes (lead_id,content,author_email,author_role) VALUES (${leadId},${content},${session.email},${session.role})`;
  revalidatePath(`/dashboard/leads/${leadId}`);
}

export async function completeFollowUpAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  if (!id) return;
  await db()`UPDATE follow_ups SET status='completed',completed_at=now() WHERE id=${id} AND status='open'`;
  revalidatePath("/dashboard");
  if (leadId) revalidatePath(`/dashboard/leads/${leadId}`);
}

export async function rescheduleFollowUpAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const raw = String(formData.get("dueAt") ?? "");
  const due = new Date(raw);
  if (!id || Number.isNaN(due.getTime())) return;
  await db()`UPDATE follow_ups SET due_at=${due.toISOString()},reason='Manually rescheduled by manager' WHERE id=${id} AND status='open'`;
  revalidatePath("/dashboard");
  if (leadId) revalidatePath(`/dashboard/leads/${leadId}`);
}

export async function retryWorkflowAction(formData: FormData) {
  await requireSession();
  const runId = String(formData.get("runId") ?? "");
  if (!runId) return;
  try {
    await retryWorkflow(runId);
  } catch {
    // retryWorkflow persists a safe, user-readable workflow state before returning.
  } finally {
    revalidatePath(`/dashboard/runs/${runId}`);
    revalidatePath("/dashboard/runs");
    revalidatePath("/dashboard");
  }
}
