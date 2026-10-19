// Calls for the tag popup. The tag token is the credential: no Authorization header.

import { getApiUrl } from "./api";

export type TagScanInfo = {
  tagLabel: string;
  taskName: string | null;
  canScan: boolean;
};
export type ScanResult = {
  title: string;
  message: string;
  tone: "started" | "done" | "cancelled" | "info";
};

export async function fetchTagScanInfo(
  token: string,
): Promise<TagScanInfo | null> {
  const response = await fetch(`${getApiUrl()}/api/scan/${token}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Servidor indisponível");
  return (await response.json()) as TagScanInfo;
}

export async function postTagAction(
  token: string,
  action: "done" | "snooze",
): Promise<ScanResult> {
  const response = await fetch(`${getApiUrl()}/api/scan/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!response.ok && response.status !== 404)
    throw new Error("Servidor indisponível");
  return (await response.json()) as ScanResult;
}
