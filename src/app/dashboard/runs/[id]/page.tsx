import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { retryWorkflowAction } from "../../../actions";

function cls(v:string){return `badge ${v==="Completed"?"badge-low":v==="Failed"?"badge-high":v==="Running"?"badge-normal":"badge-partial"}`}

export default async function RunDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params; const sql=db();
  const rows=await sql`SELECT wr.*,l.company,l.name,l.id lead_id FROM workflow_runs wr JOIN leads l ON l.id=wr.lead_id WHERE wr.id=${id} LIMIT 1`;
  if(!rows.length) notFound(); const run=rows[0];
  const steps=await sql`SELECT * FROM workflow_steps WHERE run_id=${id} ORDER BY created_at ASC,attempt ASC`;
  const retryable=String(run.status)==="Failed"||String(run.status)==="Partially Completed";
  return <>
    <div className="section-head"><div><Link className="subtle" href="/dashboard/runs">← Automation Runs</Link><h2>Execution <span className="mono">{id.slice(0,8)}…</span></h2><p>Related lead: <Link href={`/dashboard/leads/${run.lead_id}`}>{String(run.company)} · {String(run.name)}</Link></p></div><span className={cls(String(run.status))}>{String(run.status)}</span></div>
    <section className="panel">
      <div className="panel-body"><div className="detail-grid">
        <div className="kv"><span>Trigger</span><strong>{String(run.trigger)}</strong></div>
        <div className="kv"><span>Start time</span><strong>{new Date(String(run.started_at)).toLocaleString("en-GB")}</strong></div>
        <div className="kv"><span>Duration</span><strong>{run.duration_ms?`${Number(run.duration_ms)} ms`:"—"}</strong></div>
        <div className="kv"><span>Retry count</span><strong>{String(run.retry_count)} / 3</strong></div>
        <div className="kv"><span>Related lead</span><strong>{String(run.company)}</strong></div>
        <div className="kv"><span>Errors</span><strong>{String(run.error_summary ?? "None")}</strong></div>
      </div></div>
      <div className="step-list">
        {steps.map(s=><div className="step" key={String(s.id)}><div><strong>{String(s.step_name)}</strong><small>Attempt {String(s.attempt)}</small></div><span className={cls(String(s.status))}>{String(s.status)}</span><div><div>{String(s.output_summary ?? "No output summary.")}</div>{s.error_message&&<div className="error-copy">{String(s.error_message)}</div>}</div><small>{s.completed_at?new Date(String(s.completed_at)).toLocaleTimeString("en-GB"):"—"}</small></div>)}
      </div>
      {retryable&&<div className="panel-body"><form action={retryWorkflowAction}><input type="hidden" name="runId" value={id}/><button className="btn btn-danger">Retry failed action</button></form><p className="subtle" style={{marginTop:8}}>Retry limit is 3. Completed CRM/follow-up actions are protected from duplicate execution.</p></div>}
    </section>
  </>;
}
