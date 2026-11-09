export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${url}`);
  return body as T;
}
export async function sendJson<T>(method: "POST" | "PUT" | "DELETE", url: string, payload?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error ?? `${res.status} ${url}`), { status: res.status, body });
  return body as T;
}
