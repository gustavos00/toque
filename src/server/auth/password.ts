import { createHash, timingSafeEqual } from "node:crypto";

const DEV_PASSWORD = "toque";

/** TOQUE_PASSWORD; required in production, defaults to "toque" in dev/test. */
function getExpectedPassword(): string {
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
