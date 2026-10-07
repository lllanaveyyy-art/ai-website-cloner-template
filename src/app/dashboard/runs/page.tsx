import Link from "next/link";
import { db } from "@/lib/db";

function cls(v:string){return `badge ${v==="Completed"?"badge-low":v==="Failed"?"badge-high":v==="Running"?"badge-normal":"badge-partial"}`}

export default async function RunsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const q=await searchParams; const status=Array.isArray(q.status)?q.status[0]??"":q.status??"";
  const rawPage=Array.isArray(q.page)?q.page[0]:q.page; const page=Math.max(1,Number(rawPage)||1); const pageSize=30; const offset=(page-1)*pageSize;
  const sql=db();
  const [runs,totalRows]=await Promise.all([sql`SELECT wr.id,wr.trigger,wr.status,wr.started_at,wr.duration_ms,wr.retry_count,l.id lead_id,l.company,l.name
    FROM workflow_runs wr JOIN leads l ON l.id=wr.lead_id
    WHERE (${status}='' OR wr.status=${status})
    ORDER BY wr.started_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    sql`SELECT count(*)::int total FROM workflow_runs wr WHERE (${status}='' OR wr.status=${status})`]);
  const pages=Math.max(1,Math.ceil(Number(totalRows[0]?.total??0)/pageSize));
  return <>
    <div className="section-head"><div><h2>Automation Runs</h2><p>Execution history with status, duration, retries and related leads.</p></div></div>
    <section className="panel">
      <form className="filter-bar" style={{gridTemplateColumns:"1fr auto auto"}}>
        <select name="status" defaultValue={status}><option value="">All statuses</option>{["Pending","Running","Completed","Failed","Partially Completed"].map(s=><option key={s}>{s}</option>)}</select>
        <button className="btn btn-primary btn-sm">Apply</button><Link className="btn btn-secondary btn-sm" href="/dashboard/runs">Reset</Link>
      </form>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Execution ID</th><th>Related lead</th><th>Trigger</th><th>Started</th><th>Duration</th><th>Retries</th><th>Status</th></tr></thead><tbody>
        {runs.map(r=><tr key={String(r.id)}><td><Link className="mono" href={`/dashboard/runs/${r.id}`}>{String(r.id)}</Link></td><td><Link href={`/dashboard/leads/${r.lead_id}`}><strong>{String(r.company)}</strong><div className="subtle">{String(r.name)}</div></Link></td><td>{String(r.trigger)}</td><td>{new Date(String(r.started_at)).toLocaleString("en-GB")}</td><td>{r.duration_ms?`${Number(r.duration_ms)} ms`:"—"}</td><td>{String(r.retry_count)}</td><td><span className={cls(String(r.status))}>{String(r.status)}</span></td></tr>)}
      </tbody></table></div>
      {!runs.length&&<div className="empty">No workflow runs match this filter.</div>}
      <div className="pagination">{page>1&&<Link className="btn btn-secondary btn-sm" href={`/dashboard/runs?status=${encodeURIComponent(String(status))}&page=${page-1}`}>Previous</Link>}<span className="subtle">Page {page} of {pages}</span>{page<pages&&<Link className="btn btn-secondary btn-sm" href={`/dashboard/runs?status=${encodeURIComponent(String(status))}&page=${page+1}`}>Next</Link>}</div>
    </section>
  </>;
}
