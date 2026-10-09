// Public demo deployment (toque-demo): NEXT_PUBLIC_TOQUE_DEMO=1. The demo
// password is public on purpose — it is shown pre-filled on the login page.

export const DEMO_PASSWORD = "demo";

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_TOQUE_DEMO === "1";
}
