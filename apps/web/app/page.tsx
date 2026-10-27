"use client";

import { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { Workspace } from "@/components/workspace";
import { ApiError, apiRequest } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Organization } from "@/lib/types";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const recovery = new URLSearchParams(window.location.search).has("recovery");
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.has("error")) {
      setMessage("El enlace de recuperación no es válido o ha expirado. Solicita uno nuevo.");
      window.history.replaceState(null, "", "/");
    }
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      receivedEvent = true;
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY" || (event === "INITIAL_SESSION" && recovery && nextSession)) setResetting(true);
      if (!nextSession) { setResetting(false); setOrganizationId(""); setOrganizations([]); }
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) throw error;
      if (!receivedEvent) { setSession(data.session); if (recovery && data.session) setResetting(true); }
      if (recovery && !data.session) setMessage("El enlace ha expirado. Solicita un nuevo correo de recuperación.");
    }).catch(() => { if (active) setMessage("No se pudo recuperar la sesión. Vuelve a ingresar."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setSession(null); setOrganizations([]); setOrganizationId("");
      setMessage("Tu sesión expiró. Vuelve a ingresar.");
      void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    } else setMessage(error instanceof Error ? error.message : "No se pudo completar la solicitud.");
  }, []);

  const token = session?.access_token;
  useEffect(() => {
    if (!token || resetting) return;
    const controller = new AbortController();
    setLoadingOrganizations(true);
    apiRequest<Organization[]>("/organizations", token, undefined, { signal: controller.signal }).then((items) => {
      if (controller.signal.aborted) return;
      setOrganizations(items);
      setOrganizationId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? "");
    }).catch((error) => { if (!controller.signal.aborted) handleError(error); })
      .finally(() => { if (!controller.signal.aborted) setLoadingOrganizations(false); });
    return () => controller.abort();
  }, [token, resetting, revision, handleError]);

  async function signOut(passwordUpdated = false) {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setSession(null); setResetting(false); setOrganizations([]); setOrganizationId("");
      window.history.replaceState(null, "", "/");
      setMessage(passwordUpdated ? "Contraseña actualizada. Ingresa con tu nueva contraseña." : "");
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setMessage("");
    try {
      const organization = await apiRequest<Organization>("/organizations", token, undefined, { method: "POST", body: JSON.stringify({ name: fields.get("name"), slug: fields.get("slug") }) });
      setOrganizations((items) => [...items, organization]); setOrganizationId(organization.id);
      form.reset();
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }

  if (loading) return <main aria-busy="true"><p>Cargando sesión...</p></main>;
  if (!session || resetting) return <AuthPanel resetting={resetting && !!session} message={message} onMessage={setMessage} onPasswordUpdated={() => void signOut(true)} />;

  return <main>
    <header><div><h1>Workspace</h1><p>Base multi-tenant para tu producto.</p><p>Tu ID de usuario: <code data-testid="user-id">{session.user.id}</code></p></div><button disabled={busy} onClick={() => void signOut()}>Cerrar sesión</button></header>
    {message && <p role="alert">{message}</p>}
    <section><h2>Organización activa</h2>
      {loadingOrganizations ? <p role="status">Cargando organizaciones...</p> : <select aria-label="Organización activa" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setMessage(""); }}>
        <option value="">Selecciona una organización</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </select>}
      <button disabled={loadingOrganizations} onClick={() => setRevision((value) => value + 1)}>Actualizar organizaciones</button>
      <form onSubmit={createOrganization}><fieldset disabled={busy} className="inline-form">
        <input name="name" aria-label="Nueva organización" placeholder="Nueva organización" required maxLength={120} />
        <input name="slug" aria-label="Slug" placeholder="slug-unico" required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <button>Crear organización</button>
      </fieldset></form>
    </section>
    {organizationId && !loadingOrganizations && <Workspace key={`${session.user.id}:${organizationId}`} token={session.access_token} organizationId={organizationId} onError={handleError} onMembershipChanged={() => setRevision((value) => value + 1)} />}
  </main>;
}
