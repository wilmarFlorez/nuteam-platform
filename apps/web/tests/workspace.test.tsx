import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Workspace } from "@/components/workspace";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("lets admins manage ordinary members but does not expose owner controls", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/organization") return { user_id: "admin-user", role: "admin", permissions: ["members:manage", "members:read", "audit:read"] };
    if (path === "/members") return [{ user_id: "owner-user", role: "owner", is_active: true }, { user_id: "member-user", role: "member", is_active: true }];
    return [];
  });
  render(<Workspace token="jwt" organizationId="tenant" onError={vi.fn()} onMembershipChanged={vi.fn()} />);
  expect(await screen.findByRole("button", { name: "Agregar miembro" })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Rol de owner-user" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "owner" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Rol de member-user" }), { target: { value: "admin" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar miembro" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/members/member-user", "jwt", "tenant", {
    method: "PATCH", body: JSON.stringify({ role: "admin", is_active: true }),
  }));
});

it("surfaces a rejected last-owner departure", async () => {
  const error = new Error("La organización debe conservar un propietario");
  const onError = vi.fn();
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/organization") return { user_id: "owner", role: "owner", permissions: ["members:read"] };
    if (path === "/members/me") throw error;
    return [];
  });
  render(<Workspace token="jwt" organizationId="tenant" onError={onError} onMembershipChanged={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Abandonar organización" }));
  await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
});
