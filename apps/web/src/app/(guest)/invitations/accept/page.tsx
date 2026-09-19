import type { Metadata } from "next";
import { InvitationAcceptView } from "@/components/invitations/invitation-accept-view";

export const metadata: Metadata = { title: "Accept invitation · Beaco" };

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <InvitationAcceptView token={token} />;
}
