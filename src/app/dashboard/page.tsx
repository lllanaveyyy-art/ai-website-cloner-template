import Link from "next/link";
import { db } from "@/lib/db";
import { completeFollowUpAction } from "../actions";

function badgeClass(value: string) {
  const key = value.toLowerCase().replaceAll(" ", "-");
  if (key === "high" || key === "failed") return "badge badge-high";
  if (key === "normal" || key === "running") return "badge badge-normal";
  if (key === "low" || key === "completed") return "badge badge-low";
  return "badge badge-partial";
}

function one(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] ?? "" : v ?? ""; }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const q = await searchParams;
  const search = one(q.search).trim();
  const priority = one(q.priority);
  const category = one(q.category);
  const stage = one(q.stage);
  const workflow = one(q.workflow);
  const date = one(q.date);
  const page = Math.max(1, Number(one(q.page)) || 1);
  const pageSize = 12;
  const offset = (page - 1) * pageSize;
  const dateInterval = date === "today" ? "1 day" : date === "7d" ? "7 days" : date === "30d" ? "30 days" : "";
  const like = `%${search}%`;
  const sql = db();

  const [metrics, leads, totalRows, categories, followUps, followUpSummary, notifications] = await Promise.all([
    sql`SELECT
      count(*)::int leads_received,
      count(*) FILTER (WHERE pipeline_stage <> 'New')::int qualified_leads,
      count(*) FILTER (WHERE priority='High')::int high_priority,
      count(*) FILTER (WHERE workflow_state='Completed')::int completed_workflows,
      count(*) FILTER (WHERE workflow_state IN ('Failed','Partially Completed'))::int failed_workflows,
      count(*) FILTER (WHERE pipeline_stage='Won')::int won,
      count(*) FILTER (WHERE pipeline_stage NOT IN ('Won','Lost'))::int active
      FROM leads`,
    sql`SELECT id,name,company,email,priority,category,pipeline_stage,workflow_state,ai_summary,created_at
      FROM leads
      WHERE (${search}='' OR name ILIKE ${like} OR company ILIKE ${like} OR email ILIKE ${like} OR coalesce(ai_summary,'') ILIKE ${like})
        AND (${priority}='' OR priority=${priority})
        AND (${category}='' OR category=${category})
        AND (${stage}='' OR pipeline_stage=${stage})
        AND (${workflow}='' OR workflow_state=${workflow})
        AND (${dateInterval}='' OR created_at >= now() - ${dateInterval}::interval)
      ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    sql`SELECT count(*)::int total FROM leads
      WHERE (${search}='' OR name ILIKE ${like} OR company ILIKE ${like} OR email ILIKE ${like} OR coalesce(ai_summary,'') ILIKE ${like})
        AND (${priority}='' OR priority=${priority})
        AND (${category}='' OR category=${category})
        AND (${stage}='' OR pipeline_stage=${stage})
        AND (${workflow}='' OR workflow_state=${workflow})
        AND (${dateInterval}='' OR created_at >= now() - ${dateInterval}::interval)`,
    sql`SELECT DISTINCT category FROM leads ORDER BY category`,
    sql`SELECT f.id,f.lead_id,f.due_at,f.reason,l.name,l.company,(f.due_at < now()) AS is_overdue
      FROM follow_ups f JOIN leads l ON l.id=f.lead_id
      WHERE f.status='open' ORDER BY f.due_at ASC LIMIT 8`,
    sql`SELECT
      count(*) FILTER (WHERE status='open' AND due_at < now())::int overdue,
      count(*) FILTER (WHERE status='open' AND due_at >= date_trunc('day',now()) AND due_at < date_trunc('day',now()) + interval '1 day')::int due_today,
      count(*) FILTER (WHERE status='open' AND due_at >= date_trunc('day',now()) + interval '1 day')::int upcoming
      FROM follow_ups`,
    sql`SELECT id,lead_id,type,title,body,created_at FROM notifications ORDER BY created_at DESC LIMIT 6`
  ]);

  const m = metrics[0] ?? {};
  const overdue = await sql`SELECT count(*)::int count FROM follow_ups WHERE status='open' AND due_at < now()`;
  const conversion = Number(m.leads_received) ? Math.round((Number(m.won)/Number(m.leads_received))*100) : 0;
  const total = Number(totalRows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total/pageSize));
  const qs = new URLSearchParams();
  for (const [k,v] of Object.entries({search,priority,category,stage,workflow,date})) if (v) qs.set(k,v);

  return (
    <>
      <div className="section-head">
        <div><h2>Lead pipeline</h2><p>Search, qualify and follow every inbound request from one operational view.</p></div>
        <Link className="btn btn-secondary" href="/">Open public form</Link>
      </div>

      <section className="metrics" aria-label="Key metrics">
        <div className="metric"><span>Leads received</span><strong>{m.leads_received ?? 0}</strong></div>
        <div className="metric"><span>Qualified</span><strong>{m.qualified_leads ?? 0}</strong></div>
        <div className="metric"><span>High priority</span><strong>{m.high_priority ?? 0}</strong></div>
        <div className="metric"><span>Completed workflows</span><strong>{m.completed_workflows ?? 0}</strong></div>
        <div className="metric"><span>Failed / partial</span><strong>{m.failed_workflows ?? 0}</strong></div>
        <div className="metric"><span>Conversion rate</span><strong>{conversion}%</strong></div>
        <div className="metric"><span>Overdue follow-ups</span><strong>{overdue[0]?.count ?? 0}</strong></div>
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><h3>Leads</h3><span className="subtle">{total} matching records</span></div>
          <form className="filter-bar">
            <input aria-label="Search leads" name="search" defaultValue={search} placeholder="Search name, company, email, summary…"/>
            <select aria-label="Priority" name="priority" defaultValue={priority}><option value="">All priorities</option><option>High</option><option>Normal</option><option>Low</option></select>
            <select aria-label="Category" name="category" defaultValue={category}><option value="">All categories</option>{categories.map(c=><option key={String(c.category)}>{String(c.category)}</option>)}</select>
            <select aria-label="Pipeline stage" name="stage" defaultValue={stage}><option value="">All stages</option>{["New","Qualified","Contacted","Discovery","Proposal","Won","Lost"].map(s=><option key={s}>{s}</option>)}</select>
            <select aria-label="Workflow state" name="workflow" defaultValue={workflow}><option value="">All workflows</option>{["Pending","Running","Completed","Failed","Partially Completed"].map(s=><option key={s}>{s}</option>)}</select>
            <select aria-label="Date" name="date" defaultValue={date}><option value="">Any date</option><option value="today">Last 24h</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
            <button className="btn btn-primary btn-sm">Apply</button>
            <Link className="btn btn-secondary btn-sm" href="/dashboard">Reset</Link>
          </form>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Lead</th><th>Priority</th><th>Category</th><th>Stage</th><th>Workflow</th><th>AI summary</th><th>Created</th></tr></thead>
              <tbody>
                {leads.map(l=><tr key={String(l.id)}>
                  <td className="company-cell"><Link href={`/dashboard/leads/${l.id}`}><strong>{String(l.company)}</strong><span>{String(l.name)} · {String(l.email)}</span></Link></td>
                  <td><span className={badgeClass(String(l.priority))}>{String(l.priority)}</span></td>
                  <td>{String(l.category)}</td><td>{String(l.pipeline_stage)}</td>
                  <td><span className={badgeClass(String(l.workflow_state))}>{String(l.workflow_state)}</span></td>
                  <td className="summary-cell">{String(l.ai_summary ?? "Pending analysis")}</td>
                  <td>{new Date(String(l.created_at)).toLocaleDateString("en-GB")}</td>
                </tr>)}
              </tbody>
            </table>
            {leads.length===0 && <div className="empty">No leads match these filters.</div>}
          </div>
          <div className="pagination">
            {page>1 && <Link className="btn btn-secondary btn-sm" href={`/dashboard?${new URLSearchParams({...Object.fromEntries(qs),page:String(page-1)})}`}>Previous</Link>}
            <span className="subtle">Page {page} of {pages}</span>
            {page<pages && <Link className="btn btn-secondary btn-sm" href={`/dashboard?${new URLSearchParams({...Object.fromEntries(qs),page:String(page+1)})}`}>Next</Link>}
          </div>
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h3>Follow-ups</h3><span className="subtle">Next actions</span></div>
            <div className="panel-body">
              <div className="follow-summary"><span><strong>{followUpSummary[0]?.overdue ?? 0}</strong> overdue</span><span><strong>{followUpSummary[0]?.due_today ?? 0}</strong> due today</span><span><strong>{followUpSummary[0]?.upcoming ?? 0}</strong> upcoming</span></div>
              <div className="follow-list">
              {followUps.map(f=>{
                const isOverdue = Boolean(f.is_overdue);
                return <div className={`follow-item ${isOverdue ? "overdue":""}`} key={String(f.id)}>
                  <div><Link href={`/dashboard/leads/${f.lead_id}`}><strong>{String(f.company)}</strong></Link><div className="subtle">{isOverdue ? "Overdue" : "Due"} {new Date(String(f.due_at)).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"})}</div></div>
                  <form action={completeFollowUpAction}><input type="hidden" name="id" value={String(f.id)}/><input type="hidden" name="leadId" value={String(f.lead_id)}/><button className="btn btn-secondary btn-sm">Done</button></form>
                </div>;
              })}
              {followUps.length===0 && <div className="subtle">No open follow-ups.</div>}
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><h3>Notifications</h3></div>
            <div className="panel-body">
              {notifications.map(n=><div className="note" key={String(n.id)}><div className="note-meta">{new Date(String(n.created_at)).toLocaleString("en-GB")}</div><strong>{String(n.title)}</strong><div className="subtle">{String(n.body)}</div></div>)}
              {notifications.length===0 && <div className="subtle">No notifications.</div>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
