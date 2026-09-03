import { MagicLinkVerifier } from "@/components/auth/magic-link-verifier";
import { safeInternalPath } from "@/lib/auth-return";

export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token, next } = await searchParams;
  return <MagicLinkVerifier token={token} next={safeInternalPath(next) ?? undefined} />;
}
