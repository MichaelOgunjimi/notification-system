import { InvitationAcceptView } from "@/components/invitations/invitation-accept-view";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <InvitationAcceptView token={token} />;
}
