import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { addNoteAction, completeFollowUpAction, rescheduleFollowUpAction, retryWorkflowAction, updateLeadAction } from "../../../actions";

function badge(value: string) {
  const k=value.toLowerCase();
  return `badge ${k==="high"||k==="failed"?"badge-high":k==="low"||k==="completed"?"badge-low":k==="normal"||k==="running"?"badge-normal":"badge-partial"}`;
}

export default async function LeadDetail({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const sql = db();
  const leads = await sql`SELECT * FROM leads WHERE id=${id} LIMIT 1`;
  if (!leads.length) notFound();
  const l = leads[0];
  const [notes,runs,followUps,outbox,notifications] = await Promise.all([
    sql`SELECT * FROM notes WHERE lead_id=${id} ORDER BY created_at DESC`,
    sql`SELECT * FROM workflow_runs WHERE lead_id=${id} ORDER BY started_at DESC`,
    sql`SELECT * FROM follow_ups WHERE lead_id=${id} ORDER BY due_at DESC`,
    sql`SELECT email_type,to_email,subject,body,status,error_message,provider_message_id,created_at,updated_at FROM email_outbox WHERE lead_id=${id} ORDER BY created_at DESC`,
    sql`SELECT * FROM notifications WHERE lead_id=${id} ORDER BY created_at DESC`
  ]);

  return (
    <>
      <div className="section-head"><div><Link className="subtle" href="/dashboard">← Leads</Link><h2>{String(l.company)}</h2><p>{String(l.name)} · {String(l.email)}</p></div><span className={badge(String(l.priority))}>{String(l.priority)} priority</span></div>
      <div className="two-col">
        <div className="stack">
          <section className="panel"><div className="panel-head"><h3>Customer & request</h3></div><div className="panel-body">
            <div className="detail-grid">
              <div className="kv"><span>Company size</span><strong>{l.company_size ? String(l.company_size) : "Not provided"}</strong></div>
              <div className="kv"><span>Service</span><strong>{String(l.service_needed)}</strong></div>
              <div className="kv"><span>Budget</span><strong>{String(l.budget_range ?? "Not specified")}</strong></div>
              <div className="kv"><span>Phone</span><strong>{String(l.phone ?? "Not provided")}</strong></div>
            </div>
            <h3 style={{marginTop:18}}>Original submission</h3><div className="message-box">{String(l.message)}</div>
          </div></section>

          <section className="panel"><div className="panel-head"><h3>AI classification</h3><span className={badge(String(l.ai_status==="completed"?"Completed":"Partially Completed"))}>{String(l.ai_status)}</span></div><div className="panel-body ai-box">
            <div className="detail-grid">
              <div className="kv"><span>Category</span><strong>{String(l.category)}</strong></div>
              <div className="kv"><span>Department</span><strong>{String(l.department)}</strong></div>
              <div className="kv"><span>Estimated value</span><strong>{String(l.estimated_value)}</strong></div>
              <div className="kv"><span>Urgency</span><strong>{String(l.urgency)}</strong></div>
              <div className="kv"><span>Request type</span><strong>{String(l.request_type ?? "—")}</strong></div>
              <div className="kv"><span>Priority</span><strong>{String(l.priority)}</strong></div>
            </div>
            <h3 style={{marginTop:18}}>Summary</h3><p>{String(l.ai_summary ?? "No AI summary yet.")}</p>
            <h3>Recommended next action</h3><p>{String(l.recommended_action ?? "Manual review.")}</p>
          </div></section>

          <section className="panel"><div className="panel-head"><h3>Automation history</h3><Link href="/dashboard/runs">All runs</Link></div>
            <div className="table-wrap"><table className="data-table" style={{minWidth:650}}><thead><tr><th>Execution</th><th>Trigger</th><th>Status</th><th>Retries</th><th>Started</th></tr></thead><tbody>
              {runs.map(r=><tr key={String(r.id)}><td><Link className="mono" href={`/dashboard/runs/${r.id}`}>{String(r.id).slice(0,8)}…</Link></td><td>{String(r.trigger)}</td><td><span className={badge(String(r.status))}>{String(r.status)}</span></td><td>{String(r.retry_count)}</td><td>{new Date(String(r.started_at)).toLocaleString("en-GB")}</td></tr>)}
            </tbody></table></div>
          </section>
        </div>

        <div className="stack">
          <section className="panel"><div className="panel-head"><h3>Manual override</h3></div><div className="panel-body">
            <form className="note-form" action={updateLeadAction}>
              <input type="hidden" name="id" value={id}/>
              <label className="field">Priority<select name="priority" defaultValue={String(l.priority)}><option>High</option><option>Normal</option><option>Low</option></select></label>
              <label className="field">Category<input name="category" defaultValue={String(l.category)} required/></label>
              <label className="field">Pipeline stage<select name="pipelineStage" defaultValue={String(l.pipeline_stage)}>{["New","Qualified","Contacted","Discovery","Proposal","Won","Lost"].map(s=><option key={s}>{s}</option>)}</select></label>
              <button className="btn btn-primary">Save changes</button>
            </form>
          </div></section>

          <section className="panel"><div className="panel-head"><h3>Follow-up</h3></div><div className="panel-body follow-list">
            {followUps.map(f=><div className="follow-item" key={String(f.id)}><div><strong>{String(f.status)}</strong><div className="subtle">{new Date(String(f.due_at)).toLocaleString("en-GB")}</div><small className="subtle">{String(f.reason)}</small></div>{f.status==="open"&&<div className="follow-actions"><form action={rescheduleFollowUpAction} className="reschedule-form"><input type="hidden" name="id" value={String(f.id)}/><input type="hidden" name="leadId" value={id}/><input aria-label="Reschedule follow-up" type="datetime-local" name="dueAt" required/><button className="btn btn-secondary btn-sm">Reschedule</button></form><form action={completeFollowUpAction}><input type="hidden" name="id" value={String(f.id)}/><input type="hidden" name="leadId" value={id}/><button className="btn btn-secondary btn-sm">Complete</button></form></div>}</div>)}
          </div></section>

          <section className="panel"><div className="panel-head"><h3>Internal notes</h3></div><div className="panel-body">
            <form className="note-form" action={addNoteAction}><input type="hidden" name="leadId" value={id}/><textarea name="content" maxLength={4000} required placeholder="Add an internal note…"/><button className="btn btn-secondary">Add note</button></form>
            <div style={{marginTop:12}}>{notes.map(n=><div className="note" key={String(n.id)}><div className="note-meta">{String(n.author_email)} · {String(n.author_role)} · {new Date(String(n.created_at)).toLocaleString("en-GB")}</div><div>{String(n.content)}</div></div>)}</div>
          </div></section>

          <section className="panel"><div className="panel-head"><h3>Email outbox</h3><span className="subtle">Provider not configured</span></div><div className="panel-body">
            {outbox.map(o=><div className="note" key={`${o.email_type}-${o.created_at}`}>
              <div className="note-meta">{new Date(String(o.created_at)).toLocaleString("en-GB")} · {String(o.status)}</div>
              <strong>{String(o.subject)}</strong>
              <div className="subtle">To: {String(o.to_email)}</div>
              <div style={{marginTop:6}}>{String(o.body)}</div>
              {o.error_message&&<div className="error-copy">Not sent: {String(o.error_message)}</div>}
              {String(o.status)==="pending_setup"&&<div className="subtle" style={{marginTop:4}}>Not sent: outbound email provider is intentionally not configured for this portfolio deployment.</div>}
              {o.provider_message_id&&<div className="subtle mono" style={{marginTop:4}}>Provider ID: {String(o.provider_message_id)}</div>}
            </div>)}
            {!outbox.length && <div className="subtle">No email records.</div>}
          </div></section>

          {runs.some(r=>String(r.status)==="Failed"||String(r.status)==="Partially Completed") && <section className="panel"><div className="panel-head"><h3>Recovery</h3></div><div className="panel-body">
            {runs.filter(r=>String(r.status)==="Failed"||String(r.status)==="Partially Completed").slice(0,1).map(r=><form action={retryWorkflowAction} key={String(r.id)}><input type="hidden" name="runId" value={String(r.id)}/><button className="btn btn-danger">Retry failed workflow steps</button></form>)}
          </div></section>}

          <section className="panel"><div className="panel-head"><h3>Notifications</h3></div><div className="panel-body">{notifications.map(n=><div className="note" key={String(n.id)}><strong>{String(n.title)}</strong><div className="subtle">{String(n.body)}</div></div>)}</div></section>
        </div>
      </div>
    </>
  );
}
