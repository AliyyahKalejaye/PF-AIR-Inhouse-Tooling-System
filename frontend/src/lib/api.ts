// Thin fetch wrapper around the backend API. Every tool's frontend code
// should go through this rather than calling fetch() directly, so auth
// headers / error handling only need to be written once.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// FastAPI's default error shape is {"detail": "message"} (or, for
// validation errors, {"detail": [{"msg": "...", ...}, ...]}) — this class
// normalizes both into a single readable string so forms can just show
// `error.message` without caring which shape came back.
export class ApiError extends Error {
  status: number;

  constructor(status: number, detail: unknown) {
    super(ApiError.detailToMessage(detail));
    this.name = "ApiError";
    this.status = status;
  }

  private static detailToMessage(detail: unknown): string {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item)))
        .join(" ");
    }
    return "Something went wrong. Please try again.";
  }
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  let detail: unknown;
  try {
    const body = await res.json();
    detail = body?.detail;
  } catch {
    detail = undefined;
  }
  throw new ApiError(res.status, detail);
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json() as Promise<T>;
}

// The /auth/login endpoint is FastAPI's OAuth2PasswordRequestForm, which
// expects application/x-www-form-urlencoded, not JSON — this is the one
// place that differs from the rest of the API.
export async function apiPostForm<T>(path: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json() as Promise<T>;
}
