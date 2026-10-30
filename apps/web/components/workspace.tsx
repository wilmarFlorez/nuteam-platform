"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Input, Select, Spinner, type BadgeVariant } from "@/components/ui";
import { apiRequest } from "@/lib/api";
import { Access, AuditLog, Member, Role } from "@/lib/types";

type Props = { token: string; organizationId: string; onError: (error: unknown) => void; onMembershipChanged: () => void };

function roleVariant(role: Role): BadgeVariant {
  if (role === "owner") return "primary";
  if (role === "admin") return "info";
  return "neutral";
}

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

  if (loading) {
    return (
      <Card className="workspace-card" aria-busy="true">
        <div className="loading-row"><Spinner label="Cargando organización" /> <span>Cargando organización...</span></div>
      </Card>
    );
  }
  if (failed || !access) {
    return (
      <Card className="workspace-card" aria-labelledby="workspace-error-heading">
        <h2 id="workspace-error-heading">Espacio de trabajo</h2>
        <Alert variant="danger">No se pudo cargar la organización.</Alert>
        <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Reintentar</Button>
      </Card>
    );
  }
  const manage = access.permissions.includes("members:manage");
  const manageOwners = access.permissions.includes("owners:manage");
  const roles: Role[] = manageOwners ? ["member", "admin", "owner"] : ["member", "admin"];

  return (
    <Card className="workspace-card" aria-labelledby="workspace-heading">
      <h2 id="workspace-heading">Espacio listo</h2>
      <p className="workspace-role">Tu rol: <Badge variant={roleVariant(access.role)}>{access.role}</Badge></p>

      <div className="section-heading">
        <h3>Miembros</h3>
        {manage && <Badge variant="primary">Gestión habilitada</Badge>}
      </div>
      {manage && (
        <form className="member-create-form" onSubmit={addMember}>
          <fieldset className="form-fields inline-form" disabled={busy}>
            <legend>Agregar cuenta registrada</legend>
            <p className="member-help">Pide a la persona el ID de usuario que aparece en su sesión.</p>
            <label className="ui-field" htmlFor="new-member-id">
              ID de usuario
              <Input id="new-member-id" name="user_id" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" />
            </label>
            <label className="ui-field" htmlFor="new-member-role">
              Rol del nuevo miembro
              <Select id="new-member-role" name="role">{roles.map((role) => <option key={role}>{role}</option>)}</Select>
            </label>
            <Button type="submit">Agregar miembro</Button>
          </fieldset>
        </form>
      )}

      {members.length > 0 ? (
        <ul className="member-list">
          {members.map((member) => (
            <li className="member-item" key={member.user_id}>
              <div className="member-item__summary">
                <code className="member-item__id">{member.user_id}</code>
                {member.user_id === access.user_id && <span className="text-muted">(tú)</span>}
                <Badge variant={roleVariant(member.role)}>{member.role}</Badge>
                <Badge variant={member.is_active ? "success" : "neutral"}>{member.is_active ? "Activo" : "Inactivo"}</Badge>
              </div>
              {manage && (member.role !== "owner" || manageOwners) && (
                <form
                  className="member-edit-form"
                  key={`${member.user_id}:${member.role}:${member.is_active}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const fields = new FormData(event.currentTarget);
                    void mutate(`/members/${member.user_id}`, "PATCH", { role: fields.get("role"), is_active: fields.get("active") === "on" }, member.user_id === access.user_id);
                  }}
                >
                  <fieldset className="form-fields inline-form" disabled={busy}>
                    <label className="ui-field" htmlFor={`member-role-${member.user_id}`}>
                      Rol de {member.user_id}
                      <Select id={`member-role-${member.user_id}`} name="role" defaultValue={member.role}>
                        {roles.map((role) => <option key={role}>{role}</option>)}
                      </Select>
                    </label>
                    <label className="ui-checkbox-field">
                      <Checkbox name="active" defaultChecked={member.is_active} />
                      <span>Membresía activa</span>
                    </label>
                    <Button type="submit" variant="secondary">Guardar miembro</Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void mutate(`/members/${member.user_id}`, "DELETE", undefined, member.user_id === access.user_id)}
                    >
                      Retirar miembro
                    </Button>
                  </fieldset>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">Todavía no hay miembros en esta organización.</p>
      )}

      <div className="member-item__actions">
        <Button variant="destructive" size="sm" disabled={busy} onClick={() => void mutate("/members/me", "DELETE", undefined, true)}>
          Abandonar organización
        </Button>
      </div>

      {access.permissions.includes("audit:read") && (
        <Card className="audit-card" aria-labelledby="audit-heading">
          <h3 id="audit-heading">Auditoría</h3>
          {audit.length > 0 ? (
            <ul className="audit-list">
              {audit.map((event) => (
                <li className="audit-item" key={event.id}>
                  <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
                  <span>{event.action}</span>
                  <code>{event.resource_id}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No hay eventos de auditoría todavía.</p>
          )}
          {moreAudit && <Button variant="outline" size="sm" disabled={busy} onClick={loadMoreAudit}>Cargar eventos anteriores</Button>}
        </Card>
      )}
    </Card>
  );
}
