"use client";

import { useRouter } from "next/navigation";
import { InviteLinkList, type InviteLinkRow } from "@/components/invites/InviteLinkList";
import { createInvitationLink, deactivateInvitationLink } from "./actions";

export type { InviteLinkRow as InviteLink };

interface InviteManagerProps {
  clubId: string;
  clubSlug: string;
  links: InviteLinkRow[];
}

export function InviteManager({ clubId, clubSlug, links }: InviteManagerProps) {
  const router = useRouter();

  return (
    <InviteLinkList
      links={links}
      createLabel="Generar invitación"
      onCreate={() => createInvitationLink(clubId, clubSlug)}
      onRevoke={(linkId) => deactivateInvitationLink(clubId, linkId, clubSlug)}
      onChanged={() => router.refresh()}
    />
  );
}
