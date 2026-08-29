import { MagicLinkVerifier } from "@/components/auth/magic-link-verifier";

export default async function MagicLinkPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <MagicLinkVerifier token={token} />;
}
