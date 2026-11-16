// Single sign-on with a Supabase-backed portal (eu.gustavodev.pt): an access
// token from the owner's Supabase account counts as a Toque session, so the
// portal's Toque page needs no second login. Off unless all three
// TOQUE_PORTAL_* variables are set, and always off on the public demo.

import { isDemoMode } from "@/shared/demo";

type PortalConfig = { url: string; key: string; ownerId: string };

function getPortalConfig(): PortalConfig | null {
  const url = process.env.TOQUE_PORTAL_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.TOQUE_PORTAL_SUPABASE_KEY;
  const ownerId = process.env.TOQUE_PORTAL_OWNER_ID;

  if (!url || !key || !ownerId || isDemoMode()) return null;

  return { url, key, ownerId };
}

function isUserWithId(value: unknown, id: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    value.id === id
  );
}

/**
 * Is `token` a live Supabase access token of the portal's owner? Supabase
 * checks it (signature, expiry, sign-out), and only TOQUE_PORTAL_OWNER_ID is
 * accepted, so another account on the same Supabase project gets nothing.
 */
export async function isPortalTokenValid(
  token: string | undefined,
): Promise<boolean> {
  const config = getPortalConfig();

  if (!token || !config) return false;

  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) return false;

    return isUserWithId(await response.json(), config.ownerId);
  } catch {
    return false;
  }
}
