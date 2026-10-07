"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type ActionState } from "../actions";

const initialState: ActionState = { ok: false, message: "" };

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <main className="login-page">
      <section className="login-card">
        <Link className="brand" href="/"><span className="brand-mark">AF</span><span>Arcflow Automation</span></Link>
        <h1>Internal workspace</h1>
        <p className="subtle">Sign in with an authorised manager or admin account.</p>
        <form action={action}>
          <label>Email<input type="email" name="email" required autoComplete="username"/></label>
          <label>Password<input type="password" name="password" required autoComplete="current-password"/></label>
          <button className="btn btn-primary" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
          {state.message && <div className="form-status error" role="alert">{state.message}</div>}
        </form>
      </section>
    </main>
  );
}
