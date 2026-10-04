interface MemberTable {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

export interface Database {
  member: MemberTable;
}
