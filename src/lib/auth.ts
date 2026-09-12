"use client";

import { supabase } from "./supabase";

/**
 * Usernames are mapped onto a synthetic email so Supabase Auth can do the
 * password hashing, session handling and JWT signing for us — the readers
 * never see an address, they just type a name.
 */
// A real, ordinary-looking TLD: Supabase rejects reserved ones such as
// ".local" outright. Nothing is ever sent here — it only has to be valid.
const EMAIL_DOMAIN = "novelflow.app";

/** The account that inherits the bookshelf built before logins existed. */
export const LEGACY_OWNER = "admin";

export const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{2,23}$/;
export const MIN_PASSWORD = 6;

export interface AuthUser {
  id: string;
  username: string;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${EMAIL_DOMAIN}`;
}

function usernameFromEmail(email: string | undefined): string {
  if (!email) return "";
  return email.replace(new RegExp(`@${EMAIL_DOMAIN}$`), "");
}

/** Explains why a username or password will not be accepted, or null when fine. */
export function validateCredentials(
  username: string,
  password: string,
): string | null {
  const name = normalizeUsername(username);
  if (!name) return "ใส่ชื่อผู้ใช้ก่อน";
  if (!USERNAME_RULE.test(name)) {
    return "ชื่อผู้ใช้ต้องยาว 3–24 ตัว ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลางและขีดล่าง";
  }
  if (password.length < MIN_PASSWORD) {
    return `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
  }
  return null;
}

function toAuthUser(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): AuthUser {
  const fromMeta = user.user_metadata?.username;
  return {
    id: user.id,
    username:
      typeof fromMeta === "string" && fromMeta
        ? fromMeta
        : usernameFromEmail(user.email),
  };
}

/** Turns Supabase's English auth errors into something a Thai reader can act on. */
function describe(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "มีชื่อผู้ใช้นี้อยู่แล้ว ลองเข้าสู่ระบบแทน";
  }
  if (m.includes("password should be")) {
    return `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
  }
  if (m.includes("email not confirmed")) {
    return "บัญชีนี้ยังไม่ถูกยืนยัน — ปิด Confirm email ใน Supabase (Authentication → Sign In / Providers) แล้วลองใหม่";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "โปรเจกต์ Supabase ปิดการสมัครอยู่ — เปิด Allow new users to sign up ก่อน";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "ต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่";
  }
  return message;
}

function requireClient() {
  const sb = supabase();
  if (!sb) throw new Error("ยังไม่ได้ตั้งค่า Supabase — เติมค่าใน .env.local ก่อน");
  return sb;
}

export async function signUp(username: string, password: string): Promise<AuthUser> {
  const sb = requireClient();
  const name = normalizeUsername(username);

  const { data, error } = await sb.auth.signUp({
    email: usernameToEmail(name),
    password,
    options: { data: { username: name } },
  });
  if (error) throw new Error(describe(error.message));
  if (!data.user) throw new Error("สมัครไม่สำเร็จ");

  // No session back means the project still demands email confirmation, which
  // a synthetic address can never receive.
  if (!data.session) {
    throw new Error(
      "สมัครแล้วแต่เข้าสู่ระบบไม่ได้ — ปิด Confirm email ใน Supabase (Authentication → Sign In / Providers) แล้วลองเข้าสู่ระบบอีกครั้ง",
    );
  }
  return toAuthUser(data.user);
}

export async function signIn(username: string, password: string): Promise<AuthUser> {
  const sb = requireClient();
  const { data, error } = await sb.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw new Error(describe(error.message));
  if (!data.user) throw new Error("เข้าสู่ระบบไม่สำเร็จ");
  return toAuthUser(data.user);
}

export async function signOut(): Promise<void> {
  const sb = supabase();
  if (sb) await sb.auth.signOut();
}

/** The signed-in reader, or null. Used once on boot to restore a session. */
export async function currentUser(): Promise<AuthUser | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ? toAuthUser(data.session.user) : null;
}

export function onAuthChange(fn: (user: AuthUser | null) => void): () => void {
  const sb = supabase();
  if (!sb) return () => undefined;
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    fn(session?.user ? toAuthUser(session.user) : null);
  });
  return () => data.subscription.unsubscribe();
}
