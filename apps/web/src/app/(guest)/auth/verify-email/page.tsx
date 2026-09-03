import { VerifyEmailView } from "@/components/settings/verify-email-view";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailView token={token} />;
}
