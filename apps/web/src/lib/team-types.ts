import type { PageInfo, StaffAction, StatusTone } from "./staff-types";

/** Shapes of the staff-management API (`/api/v1/staff/team/`, D-58). */
export type TeamStatusCode = "active" | "suspended" | "invited" | "invitation_expired" | "removed";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: { code: string; label: string } | null;
  status: { code: TeamStatusCode; label: string; tone: StatusTone };
  last_login: string | null;
  joined: string;
  invitation_expires_at: string | null;
  is_you: boolean;
};

export type RoleChoice = { value: string; label: string; summary: string };

export type TeamList = {
  summary: { total: number; active: number; suspended: number; pending: number; expired: number };
  data: TeamRow[];
  page: PageInfo;
  roles: RoleChoice[];
};

export type TeamActivityRow = {
  id: number;
  at: string;
  what: string;
  action: string;
  severity: string;
  actor: string;
  target: string | null;
  details: Record<string, unknown> | null;
};

export type TeamMember = TeamRow & {
  email_verified: boolean;
  two_step: boolean;
  invited_by: string | null;
  role_summary: string;
  permissions: string[];
  sessions: { id: string; device: string; last_seen: string; created: string }[];
  stats: {
    created: number;
    edited: number;
    submitted: number;
    reviewed: number;
    verified: number;
    published: number;
  };
  recent_listings: { id: string; title: string; what: string; at: string; href: string }[];
  activity: { data: TeamActivityRow[]; page: PageInfo };
  protected: { self: boolean; last_administrator: boolean };
  actions: StaffAction[];
  row_version: number;
};
