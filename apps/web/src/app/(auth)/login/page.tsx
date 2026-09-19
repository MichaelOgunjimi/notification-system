import { LoginForm } from "@/components/auth/login-form";
import { safeInternalPath } from "@/lib/safe-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeInternalPath(next) ?? undefined} />;
}
