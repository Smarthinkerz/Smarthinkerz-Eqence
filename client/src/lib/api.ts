// Client for the Eqence API (api.eqence.com). Auth is Better Auth's session cookie,
// scoped to .eqence.com, so every request is sent with credentials.
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'https://api.eqence.com';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: string) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(data.message || data.error || `Request failed (${res.status})`, res.status, data.detail);
  return data as T;
}

export interface Me {
  user: { id: string; name: string; email: string; emailVerified: boolean; role: string; isSuperUser: boolean };
  tenant?: { id: string; name: string; plan: string | null; planStatus: string; planCycle: string | null; planExpiresAt: string | null };
}

export interface ReplyRow {
  id: string; body: string; language: string | null; generatedBy: 'ai' | 'human' | 'ai_edited';
  status: 'draft' | 'pending_approval' | 'approved' | 'published' | 'rejected' | 'failed';
  error: string | null; publishedAt: string | null; createdAt: string;
}

export interface InteractionRow {
  id: string; source: string; channelType: string; subject: string | null; title: string | null; body: string;
  rating: number | null; language: string | null; sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  sentimentScore: number | null; intent: string | null; status: string; isPublic: boolean; postedAt: string;
  responses: ReplyRow[];
}

export interface ConnectionRow {
  id: string; source: string; externalAccount: string; status: string; lastSyncAt: string | null; error: string | null; createdAt: string;
}

export const auth = {
  session: () => api<{ user?: Me['user'] } | null>('/api/auth/get-session'),
  signIn: (email: string, password: string) => api('/api/auth/sign-in/email', { method: 'POST', body: { email, password } }),
  signUp: (name: string, email: string, password: string) =>
    api('/api/auth/sign-up/email', { method: 'POST', body: { name, email, password, callbackURL: `${location.origin}/app` } }),
  signOut: () => api('/api/auth/sign-out', { method: 'POST', body: {} }),
  requestReset: (email: string) =>
    api('/api/auth/request-password-reset', { method: 'POST', body: { email, redirectTo: `${location.origin}/app/reset-password` } }),
  resetPassword: (token: string, newPassword: string) => api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword } }),
};
