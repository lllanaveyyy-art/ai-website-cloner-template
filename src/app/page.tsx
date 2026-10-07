"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { submitLead, type ActionState } from "./actions";

const initialState: ActionState = { ok: false, message: "" };

export default function Home() {
  const [state, action, pending] = useActionState(submitLead, initialState);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => setIdempotencyKey(crypto.randomUUID()), []);

  return (
    <main className="public-shell">
      <nav className="public-nav">
        <div className="brand"><span className="brand-mark">AF</span><span>Arcflow Automation</span></div>
        <Link className="nav-link" href="/login">Manager login →</Link>
      </nav>
      <section className="lead-hero">
        <div className="lead-copy">
          <span className="eyebrow">B2B operations automation</span>
          <h1>Turn inbound requests into qualified, actionable leads.</h1>
          <p>Submit a project request. Arcflow stores it first, classifies it with AI, creates the CRM record, prepares notifications, schedules follow-up, and tracks every workflow step.</p>
          <div className="workflow-mini" aria-label="Workflow overview">
            <div><span className="step-dot"/><p><strong>1. Capture & protect</strong><span>Validated lead storage with duplicate-submit protection.</span></p></div>
            <div><span className="step-dot"/><p><strong>2. Analyse & route</strong><span>Structured AI classification with schema validation and fallback rules.</span></p></div>
            <div><span className="step-dot"/><p><strong>3. Operationalise</strong><span>CRM state, internal notification, follow-up and auditable execution history.</span></p></div>
          </div>
        </div>
        <div className="form-card">
          <h2>Tell us what you need</h2>
          <p className="subtle">A concise brief is enough. Required fields are marked.</p>
          <form action={action}>
            <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
            <div className="field-grid">
              <div className="field"><label htmlFor="name">Name *</label><input id="name" name="name" required minLength={2}/></div>
              <div className="field"><label htmlFor="company">Company *</label><input id="company" name="company" required minLength={2}/></div>
              <div className="field"><label htmlFor="email">Work email *</label><input id="email" name="email" type="email" required/></div>
              <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" autoComplete="tel"/></div>
              <div className="field"><label htmlFor="companySize">Company size</label><input id="companySize" name="companySize" type="number" min="1" placeholder="e.g. 35"/></div>
              <div className="field"><label htmlFor="serviceNeeded">Service needed *</label><select id="serviceNeeded" name="serviceNeeded" required defaultValue=""><option value="" disabled>Select service</option><option>CRM Implementation</option><option>Workflow Automation</option><option>AI Lead Processing</option><option>Systems Integration</option><option>Operations Consulting</option></select></div>
              <div className="field full"><label htmlFor="budgetRange">Budget range</label><select id="budgetRange" name="budgetRange" defaultValue=""><option value="">Not specified</option><option>Under $5k</option><option>$5k–$15k</option><option>$15k–$25k</option><option>$25k–$50k</option><option>$50k+</option></select></div>
              <div className="field full"><label htmlFor="message">Project brief *</label><textarea id="message" name="message" required minLength={15} placeholder="We have a team of 35 people and need a new CRM. We currently use spreadsheets and want to migrate before January."/></div>
            </div>
            <button className="btn btn-primary" disabled={pending || !idempotencyKey} type="submit">{pending ? "Processing workflow…" : "Submit request"}</button>
            {state.message && <div role="status" className={`form-status ${state.ok ? "ok" : "error"}`}>{state.message}</div>}
          </form>
        </div>
      </section>
    </main>
  );
}
