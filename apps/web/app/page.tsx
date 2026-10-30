"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { Workspace } from "@/components/workspace";
import { Alert, Button, Card, Input, Select, Spinner, type AlertVariant } from "@/components/ui";
import { ApiError, apiRequest } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Organization } from "@/lib/types";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [message, setMessage] = useState("");
  const [messageVariant, setMessageVariant] = useState<AlertVariant>("info");
  const [loading, setLoading] = useState(true);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [revision, setRevision] = useState(0);

  const showMessage = useCallback((nextMessage: string, variant: AlertVariant = "info") => {
    setMessage(nextMessage);
    setMessageVariant(variant);
  }, []);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const recovery = new URLSearchParams(window.location.search).has("recovery");
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.has("error")) {
      showMessage("El enlace de recuperación no es válido o ha expirado. Solicita uno nuevo.", "danger");
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
      if (recovery && !data.session) showMessage("El enlace ha expirado. Solicita un nuevo correo de recuperación.", "danger");
    }).catch(() => { if (active) showMessage("No se pudo recuperar la sesión. Vuelve a ingresar.", "danger"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [showMessage]);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setSession(null); setOrganizations([]); setOrganizationId("");
      showMessage("Tu sesión expiró. Vuelve a ingresar.", "danger");
      void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    } else showMessage(error instanceof Error ? error.message : "No se pudo completar la solicitud.", "danger");
  }, [showMessage]);

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
      showMessage(passwordUpdated ? "Contraseña actualizada. Ingresa con tu nueva contraseña." : "", passwordUpdated ? "success" : "info");
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
      showMessage("Organización creada.", "success");
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }

  if (loading) {
    return (
      <main className="app-shell" aria-busy="true">
        <div className="loading-row"><Spinner label="Cargando sesión" /> <span>Cargando sesión...</span></div>
      </main>
    );
  }
  if (!session || resetting) {
    return (
      <AuthPanel
        resetting={resetting && !!session}
        message={message}
        messageVariant={messageVariant}
        onMessage={showMessage}
        onPasswordUpdated={() => void signOut(true)}
      />
    );
  }

  return <main className="app-shell">
    <header className="page-header">
      <div className="page-header__copy">
        <p className="eyebrow">Espacio de trabajo</p>
        <h1>Workspace</h1>
        <p className="page-header__description">Base multi-tenant para tu producto.</p>
        <p className="page-header__identity">Tu ID de usuario: <code data-testid="user-id">{session.user.id}</code></p>
      </div>
      <Button variant="outline" disabled={busy} onClick={() => void signOut()}>Cerrar sesión</Button>
    </header>
    {message && <Alert className="page-message" variant={messageVariant} role="alert">{message}</Alert>}
    <Card className="workspace-card" aria-labelledby="organization-heading">
      <h2 id="organization-heading">Organización activa</h2>
      {loadingOrganizations ? (
        <div className="loading-row"><Spinner label="Cargando organizaciones" /> <span>Cargando organizaciones...</span></div>
      ) : (
        <div className="organization-controls">
          <label className="ui-field" htmlFor="active-organization">
            Organización
            <Select
              id="active-organization"
              aria-label="Organización activa"
              value={organizationId}
              onChange={(event) => { setOrganizationId(event.target.value); showMessage(""); }}
            >
              <option value="">Selecciona una organización</option>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </Select>
          </label>
          <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>Actualizar organizaciones</Button>
        </div>
      )}
      <form className="organization-form" onSubmit={createOrganization}>
        <fieldset className="form-fields inline-form inline-form--create" disabled={busy}>
          <label className="ui-field" htmlFor="new-organization-name">
            Nombre
            <Input id="new-organization-name" name="name" aria-label="Nueva organización" placeholder="Nombre de la organización" required maxLength={120} />
          </label>
          <label className="ui-field" htmlFor="new-organization-slug">
            Slug
            <Input id="new-organization-slug" name="slug" aria-label="Slug" placeholder="slug-unico" required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </label>
          <Button type="submit">Crear organización</Button>
        </fieldset>
      </form>
    </Card>
    {organizationId && !loadingOrganizations && <Workspace key={`${session.user.id}:${organizationId}`} token={session.access_token} organizationId={organizationId} onError={handleError} onMembershipChanged={() => setRevision((value) => value + 1)} />}
  </main>;
}
