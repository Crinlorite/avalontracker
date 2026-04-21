export class ApiError extends Error {
  constructor(public code: string, public status: number, public payload: unknown) {
    super(code);
  }
}

export async function fetcher<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: "UNKNOWN", message: "Error desconocido" } }));
    throw new ApiError(body?.error?.code ?? "UNKNOWN", res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
