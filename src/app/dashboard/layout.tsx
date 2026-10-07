import Link from "next/link";
import { logoutAction } from "../actions";
import { requireSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard"><span className="brand-mark">AF</span><span>Arcflow Ops</span></Link>
        <nav className="side-links" aria-label="Dashboard">
          <Link href="/dashboard"><span>Leads</span></Link>
          <Link href="/dashboard/runs"><span>Automation Runs</span></Link>
          <Link href="/"><span>Public Form</span></Link>
        </nav>
        <div className="side-footer">
          <small title={session.email}>{session.email}</small>
          <form action={logoutAction}><button className="btn btn-sm" type="submit">Log out</button></form>
        </div>
      </aside>
      <main className="main">
        <header className="topbar"><h1>Lead Operations</h1><span className="role">{session.role}</span></header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
