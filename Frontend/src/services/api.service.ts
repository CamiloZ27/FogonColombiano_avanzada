export const API_ORIGIN =
  import.meta.env.VITE_API_ORIGIN ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000';

const TOKEN_KEY = 'fogon_jwt_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('token');
  }
}

let onUnauthorizedCallback: (() => void) | null = null;

export function registerUnauthorizedHandler(cb: () => void) {
  onUnauthorizedCallback = cb;
}

export async function apiRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    auth?: boolean;
  } = {}
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_ORIGIN}${endpoint}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && auth && onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
    throw new Error(data.error || data.detail || `Error HTTP ${res.status}`);
  }

  return data as T;
}

