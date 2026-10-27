import type { FamilyRole } from "@/modules/family/permissions";

export type Membership = {
  userId: string;
  memberId: string;
  familyId: string;
  familyName: string;
  role: FamilyRole;
};

export type MemberView = {
  memberId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: FamilyRole;
  joinedAt: string;
  isMe: boolean;
};

export type InviteView = {
  id: string;
  role: "admin" | "member";
  invitedEmail: string | null;
  expiresAt: string;
  createdAt: string;
};

export type InvitePreview = {
  familyName: string;
  role: "admin" | "member";
  expiresAt: string;
  status: "pending" | "expired" | "accepted" | "revoked";
  emailBound: boolean;
};

export type FamilyOverview = {
  family: { id: string; name: string };
  myRole: FamilyRole;
  members: MemberView[];
};
