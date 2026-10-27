"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Access, AuditLog, Member, Role } from "@/lib/types";

type Props = { token: string; organizationId: string; onError: (error: unknown) => void; onMembershipChanged: () => void };

export function Workspace({ token, organizationId, onError, onMembershipChanged }: Props) {
  const [access, setAccess] = useState<Access | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [moreAudit, setMoreAudit] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    async function load() {
      const options = { signal: controller.signal };
      const context = await apiRequest<Access>("/organization", token, organizationId, options);
      const [items, events] = await Promise.all([
        apiRequest<Member[]>("/members", token, organizationId, options),
        context.permissions.includes("audit:read") ? apiRequest<AuditLog[]>("/audit-logs?limit=20", token, organizationId, options) : Promise.resolve([]),
      ]);
      if (!controller.signal.aborted) {
        setAccess(context); setMembers(items); setAudit(events); setMoreAudit(events.length === 20);
      }
    }
    load().catch((error) => { if (!controller.signal.aborted) { setFailed(true); onError(error); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, organizationId, revision, onError]);

  async function mutate(path: string, method: string, body?: unknown, selfChanged = false) {
    setBusy(true);
    try {
      await apiRequest(path, token, organizationId, { method, body: body ? JSON.stringify(body) : undefined });
      if (selfChanged) onMembershipChanged();
      setRevision((value) => value + 1);
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate("/members", "POST", { user_id: data.get("user_id"), role: data.get("role") });
  }

  async function loadMoreAudit() {
    setBusy(true);
    try {
      const events = await apiRequest<AuditLog[]>(`/audit-logs?limit=20&before=${audit.at(-1)?.id}`, token, organizationId);
      setAudit((current) => [...current, ...events]); setMoreAudit(events.length === 20);
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  if (loading) return <section aria-busy="true"><p>Cargando organización...</p></section>;
  if (failed || !access) return <section><p>No se pudo cargar la organización.</p><button onClick={() => setRevision((value) => value + 1)}>Reintentar</button></section>;
  const manage = access.permissions.includes("members:manage");
  const manageOwners = access.permissions.includes("owners:manage");
  const roles: Role[] = manageOwners ? ["member", "admin", "owner"] : ["member", "admin"];

  return <section>
    <h2>Espacio listo</h2><p>Tu rol: <strong>{access.role}</strong></p>
    <h3>Miembros</h3>
    {manage && <form onSubmit={addMember}>
      <fieldset disabled={busy}><legend>Agregar cuenta registrada</legend>
        <p>Pide a la persona el ID de usuario que aparece en su sesión.</p>
        <label>ID de usuario<input name="user_id" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label>
        <label>Rol del nuevo miembro<select name="role">{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
        <button>Agregar miembro</button>
      </fieldset>
    </form>}
    <ul className="members">{members.map((member) => <li key={member.user_id}>
      <p><code>{member.user_id}</code> {member.user_id === access.user_id && "(tú)"} — {member.role} · {member.is_active ? "Activo" : "Inactivo"}</p>
      {manage && (member.role !== "owner" || manageOwners) && <form key={`${member.user_id}:${member.role}:${member.is_active}`} onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        void mutate(`/members/${member.user_id}`, "PATCH", { role: fields.get("role"), is_active: fields.get("active") === "on" }, member.user_id === access.user_id);
      }}>
        <fieldset disabled={busy} className="inline-form">
          <label>Rol de {member.user_id}<select name="role" defaultValue={member.role}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
          <label><input name="active" type="checkbox" defaultChecked={member.is_active} /> Membresía activa</label>
          <button>Guardar miembro</button>
          <button type="button" onClick={() => void mutate(`/members/${member.user_id}`, "DELETE", undefined, member.user_id === access.user_id)}>Retirar miembro</button>
        </fieldset>
      </form>}
    </li>)}</ul>
    <button disabled={busy} onClick={() => void mutate("/members/me", "DELETE", undefined, true)}>Abandonar organización</button>
    {access.permissions.includes("audit:read") && <section><h3>Auditoría</h3>
      <ul>{audit.map((event) => <li key={event.id}><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time> — {event.action} — <code>{event.resource_id}</code></li>)}</ul>
      {moreAudit && <button disabled={busy} onClick={loadMoreAudit}>Cargar eventos anteriores</button>}
    </section>}
  </section>;
}
