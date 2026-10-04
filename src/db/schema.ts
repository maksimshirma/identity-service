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

export interface Database {
  member: MemberTable;
  grants: GrantsTable;
  installed_apps: InstalledAppsTable;
  clients: ClientsTable;
  signing_keys: SigningKeysTable;
}
