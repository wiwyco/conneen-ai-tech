import crypto from "node:crypto";
import { cleanEmail, parseCookie } from "./http";
import { eq, insertRow, selectOne, updateRows } from "./supabase";

export const PORTAL_SESSION_COOKIE = "conneen_portal_session";

export type PortalRole = "admin" | "conneen_collaborator" | "client_owner" | "client_member";

export type PortalUser = {
  id: string;
  client_id: string | null;
  email: string;
  display_name: string;
  role: PortalRole;
  password_hash?: string | null;
  disabled_at?: string | null;
};

export type PortalSession = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at?: string | null;
};

export type PortalAuth = {
  user: PortalUser;
  isAdmin: boolean;
  clientId: string | null;
};

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createToken(): string {
  return base64Url(crypto.randomBytes(32));
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });

  return `scrypt:${base64Url(salt)}:${base64Url(hash)}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean> {
  if (!storedHash) return false;
  const [scheme, saltText, hashText] = storedHash.split(":");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;

  const salt = Buffer.from(saltText.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expected = Buffer.from(hashText.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function sessionCookie(token: string, maxAgeSeconds = 60 * 60 * 24 * 7): string {
  return `${PORTAL_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${PORTAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function createSession(user: PortalUser, request: Request): Promise<string> {
  const token = createToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  await insertRow("portal_sessions", {
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    user_agent: request.headers.get("user-agent"),
    ip_address: request.headers.get("x-forwarded-for") || null,
  });
  await updateRows("portal_users", { id: eq(user.id) }, { last_login_at: new Date().toISOString() });

  return token;
}

export async function authenticateRequest(request: Request): Promise<PortalAuth | null> {
  const token = parseCookie(request.headers.get("cookie"))[PORTAL_SESSION_COOKIE];
  if (!token) return null;

  const session = await selectOne<PortalSession>("portal_sessions", {
    token_hash: eq(hashToken(token)),
    revoked_at: "is.null",
  });
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;

  const user = await selectOne<PortalUser>("portal_users", { id: eq(session.user_id), disabled_at: "is.null" });
  if (!user) return null;

  return {
    user,
    isAdmin: user.role === "admin" || user.role === "conneen_collaborator",
    clientId: user.client_id,
  };
}

export async function requirePortalAuth(request: Request): Promise<PortalAuth> {
  const auth = await authenticateRequest(request);
  if (!auth) throw new Error("Authentication required.");
  return auth;
}

export async function findUserByEmail(email: unknown): Promise<PortalUser | null> {
  const normalized = cleanEmail(email);
  if (!normalized) return null;
  return selectOne<PortalUser>("portal_users", { email: eq(normalized), disabled_at: "is.null" });
}

export function canAccessClient(auth: PortalAuth, clientId: string): boolean {
  return auth.isAdmin || auth.clientId === clientId;
}
