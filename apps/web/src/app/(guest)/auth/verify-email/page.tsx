import type { Metadata } from "next";
import { VerifyEmailView } from "@/components/settings/verify-email-view";

export const metadata: Metadata = { title: "Verify email · Beaco" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailView token={token} />;
}
