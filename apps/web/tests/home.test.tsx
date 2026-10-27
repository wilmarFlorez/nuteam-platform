import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { ApiError, apiRequest } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const auth = vi.hoisted(() => ({ callback: undefined as undefined | ((event: string, session: unknown) => void) }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {
  getSession: vi.fn(), onAuthStateChange: vi.fn((callback) => { auth.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
  signOut: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),
} } }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiRequest: vi.fn() }));
const session = { access_token: "jwt", user: { id: "user-a" } };
const orgs = [{ id: "org-a", name: "Organization A" }, { id: "org-b", name: "Organization B" }];

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null });
  vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });
  vi.mocked(apiRequest).mockImplementation(async (path, _token, organization) => {
    if (path === "/organizations") return orgs;
    if (path === "/organization") return { organization_id: organization, user_id: "user-a", role: "member", permissions: ["members:read", "members:leave"] };
    if (path === "/members") return [{ user_id: `${organization}-member`, role: "member", is_active: true }];
    return [];
  });
});

async function signIn() {
  await screen.findByRole("button", { name: "Ingresar" });
  act(() => auth.callback?.("SIGNED_IN", session));
}

describe("session and tenant UI", () => {
  it("shows session loading and handles initialization failure", async () => {
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error("network"));
    render(<Home />);
    expect(screen.getByText("Cargando sesión...")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo recuperar la sesión");
  });

  it("clears tenant data and requests login when the API session expires", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(401, "invalid_token", "expired"));
    render(<Home />); await signIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("Tu sesión expiró");
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Espacio listo" })).not.toBeInTheDocument();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("hides administration from members and clears old tenant content on switch", async () => {
    render(<Home />); await signIn();
    expect(await screen.findByText("org-a-member")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar miembro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Auditoría" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Organización activa" }), { target: { value: "org-b" } });
    expect(screen.queryByText("org-a-member")).not.toBeInTheDocument();
    expect(await screen.findByText("org-b-member")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/members", "jwt", "org-b", expect.any(Object));
  });

  it("ignores a late response from a previous organization", async () => {
    let resolveOld: (value: unknown) => void = () => undefined;
    vi.mocked(apiRequest).mockImplementation(async (path, _token, organization) => {
      if (path === "/organizations") return orgs;
      if (path === "/organization") return { role: "member", permissions: ["members:read"] };
      if (organization === "org-a") return new Promise((resolve) => { resolveOld = resolve; });
      return [{ user_id: "new-tenant-user", role: "member", is_active: true }];
    });
    render(<Home />); await signIn();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/members", "jwt", "org-a", expect.any(Object)));
    fireEvent.change(screen.getByRole("combobox", { name: "Organización activa" }), { target: { value: "org-b" } });
    await screen.findByText("new-tenant-user");
    await act(async () => resolveOld([{ user_id: "old-tenant-user" }]));
    expect(screen.queryByText("old-tenant-user")).not.toBeInTheDocument();
  });

  it("offers retry when the workspace fails to load", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === "/organizations") return orgs;
      throw new Error("Servicio no disponible");
    });
    render(<Home />); await signIn();
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Servicio no disponible");
  });
});

describe("password recovery", () => {
  it("sends the configured recovery redirect", async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null });
    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "Olvidé mi contraseña" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar recuperación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Si existe una cuenta");
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("user@example.test", { redirectTo: `${window.location.origin}/?recovery=1` });
  });

  it("handles PASSWORD_RECOVERY, validates confirmation and updates the password", async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({ data: { user: session.user }, error: null } as Awaited<ReturnType<typeof supabase.auth.updateUser>>);
    render(<Home />); await screen.findByRole("button", { name: "Ingresar" });
    act(() => auth.callback?.("PASSWORD_RECOVERY", session));
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "new-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "different-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no coinciden");
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Contraseña actualizada");
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
  });

  it("explains an expired recovery link", async () => {
    window.history.replaceState(null, "", "/?recovery=1#error=access_denied&error_code=otp_expired");
    render(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/expir/);
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  });
});
