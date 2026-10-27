export async function apiRequest<T>(path: string, token: string, organizationId?: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL is required.");
  const response = await fetch(`${baseUrl}/api/v1${path}`, { ...init, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(organizationId ? { "X-Organization-Id": organizationId } : {}), ...init.headers } });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, error?.code ?? "request_failed", error?.message ?? "No se pudo completar la solicitud.", response.headers.get("X-Request-Id"));
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId: string | null = null) {
    super(message);
    this.name = "ApiError";
  }
}
