import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Role = "Admin" | "Manager";
export type Session = { email: string; role: Role; exp: number };

const COOKIE = "arcflow_session";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured.");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function encodeSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token?: string | null): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (!parsed.email || !["Admin", "Manager"].includes(parsed.role) || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  return decodeSession(store.get(COOKIE)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function setSession(email: string, role: Role) {
  const store = await cookies();
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  store.set(COOKIE, encodeSession({ email, role, exp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60
  });
}

export async function clearSession() {
  const store = await cookies();
  store.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "lax" });
}

export function authenticate(email: string, password: string): Session | null {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@arcflow.test";
  const managerEmail = process.env.MANAGER_EMAIL ?? "manager@arcflow.test";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const managerPassword = process.env.MANAGER_PASSWORD;

  if (adminPassword && email === adminEmail && password === adminPassword) {
    return { email, role: "Admin", exp: 0 };
  }
  if (managerPassword && email === managerEmail && password === managerPassword) {
    return { email, role: "Manager", exp: 0 };
  }
  return null;
}
