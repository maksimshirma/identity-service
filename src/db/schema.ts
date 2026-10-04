import type { ColumnType, Generated } from "kysely";

interface MemberTable {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

interface GrantsTable {
  hid: string;
  userId: string;
  appId: string;
  level: "view" | "edit";
}

interface InstalledAppsTable {
  hid: string;
  appId: string;
  installedAt: Generated<Date>;
  confirmed: Generated<boolean>;
}

interface AppManifestsTable {
  appId: string;
  permissions: string[];
}

interface ClientsTable {
  clientId: string;
  type: "bff" | "alt-frontend" | "service";
  credentialHash: string | null;
  allowedApps: string[];
  createdAt: Generated<Date>;
}

interface SigningKeysTable {
  kid: string;
  publicKey: string;
  privateKey: string;
  createdAt: ColumnType<Date, Date | string, never>;
  retiredAt: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

interface PatTable {
  id: string;
  userId: string;
  tokenHash: string;
  name: string | null;
  createdAt: ColumnType<Date, Date | string, never>;
  revokedAt: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

interface ServiceGrantsTable {
  clientId: string;
  appId: string;
  scope: string[];
}

interface StepUpTable {
  sessionToken: string;
  reauthAt: ColumnType<Date, Date | string, Date | string>;
}

interface GrantRequestsTable {
  id: string;
  hid: string;
  userId: string;
  appId: string;
  requestedLevel: "view" | "edit";
  status: Generated<"pending" | "approved" | "denied">;
  decidedBy: string | null;
  decidedAt: ColumnType<Date | null, Date | string | null, Date | string | null>;
  createdAt: ColumnType<Date, Date | string, never>;
}

export interface Database {
  member: MemberTable;
  grants: GrantsTable;
  installed_apps: InstalledAppsTable;
  clients: ClientsTable;
  signing_keys: SigningKeysTable;
  pat: PatTable;
  service_grants: ServiceGrantsTable;
  app_manifests: AppManifestsTable;
  step_up: StepUpTable;
  grant_requests: GrantRequestsTable;
}
