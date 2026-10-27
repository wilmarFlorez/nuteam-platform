import { describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest } from "../lib/api";

describe("apiRequest", () => {
  it("sends the session and active organization", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/members", "jwt", "organization-id");
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/v1/members", expect.objectContaining({ headers: expect.objectContaining({ "X-Organization-Id": "organization-id", Authorization: "Bearer jwt" }) }));
  });

  it("exposes the API error message", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Session expired" }), { status: 401 })));
    await expect(apiRequest("/organizations", "expired-token")).rejects.toThrow("Session expired");
    await expect(apiRequest("/organizations", "expired-token")).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest("/organizations", "expired-token")).rejects.toMatchObject({ status: 401 });
  });
});
