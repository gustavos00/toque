import { createHash, timingSafeEqual } from "node:crypto";
import { DEMO_PASSWORD, isDemoMode } from "@/shared/demo";

const DEV_PASSWORD = "toque";

/**
 * TOQUE_PASSWORD; required in production, defaults to "toque" in dev/test.
 * The public demo always uses the public DEMO_PASSWORD.
 */
function getExpectedPassword(): string {
  if (isDemoMode()) return DEMO_PASSWORD;
  const password = process.env.TOQUE_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV === "production")
    throw new Error("TOQUE_PASSWORD must be set.");
  return DEV_PASSWORD;
}

function hashValue(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison against TOQUE_PASSWORD. */
export function isPasswordCorrect(candidate: string): boolean {
  return timingSafeEqual(
    hashValue(candidate),
    hashValue(getExpectedPassword()),
  );
}
