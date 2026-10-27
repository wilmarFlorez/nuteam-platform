export type Role = "owner" | "admin" | "member";
export type Organization = { id: string; name: string; slug: string; is_active: boolean };
export type Member = { organization_id: string; user_id: string; role: Role; is_active: boolean };
export type Access = { organization_id: string; user_id: string; role: Role; permissions: string[] };
export type AuditLog = { id: number; action: string; actor_id: string | null; resource_id: string | null; created_at: string };
