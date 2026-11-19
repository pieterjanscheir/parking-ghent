import { createHash, timingSafeEqual } from "node:crypto";

// Vercel calls scheduled routes with "Authorization: Bearer <CRON_SECRET>"
// when that environment variable is set on the project. The routes are plain
// public URLs otherwise, so without the secret nobody gets in — including when
// the variable was never configured.
export function isAuthorizedCron(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization) return false;
  // Compare digests: equal length whatever was sent, and no early exit that
  // would reveal how much of the secret matched.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
