// Thin fetch wrapper around the backend API. Every tool's frontend code
// should go through this rather than calling fetch() directly, so auth
// headers / error handling only need to be written once.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
