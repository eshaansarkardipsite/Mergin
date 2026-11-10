const BASE = '/api';

export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];
  constructor(status: number, message: string, issues?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.error ?? `Request failed (${response.status}).`;
    throw new ApiError(response.status, message, data?.issues);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.issues?.length) return `${error.message} ${error.issues.map((i) => i.message).join(' ')}`;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
