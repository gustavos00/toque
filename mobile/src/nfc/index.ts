// In-app NFC (react-native-nfc-manager). Needs a dev build signed with a paid Apple team
// (NFC Tag Reading entitlement + NFCReaderUsageDescription, see the plugin lines in the
// hand-off). The tag stores one NDEF URI record: the task tag's https URL.

import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";

let isStarted = false;

async function ensureStarted(): Promise<void> {
  if (!isStarted) {
    await NfcManager.start();
    isStarted = true;
  }
}

export async function isNfcAvailable(): Promise<boolean> {
  return NfcManager.isSupported().catch(() => false);
}

/** Waits for a tag and returns its first NDEF URI (null if it has none). */
export async function readTagUrl(): Promise<string | null> {
  await ensureStarted();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: "Encosta o iPhone à etiqueta",
    });
    const tag = await NfcManager.getTag();
    for (const record of tag?.ndefMessage ?? []) {
      const uri = Ndef.uri.decodePayload(Uint8Array.from(record.payload));
      if (typeof uri === "string" && uri) return uri;
    }
    return null;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/** Writes `url` as an NDEF URI record, replacing what the tag holds. */
export async function writeTagUrl(url: string): Promise<void> {
  await ensureStarted();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: "Encosta o iPhone à etiqueta para gravar",
    });
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(url)]);
    if (!bytes) throw new Error("Não foi possível codificar o URL");
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    await NfcManager.setAlertMessageIOS("Etiqueta gravada");
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/** The tag token inside a Toque tag URL (`…/t/<token>` or `toque://t/<token>`), if any. */
export function readTokenFromUrl(url: string): string | null {
  return /\/t\/([A-Za-z0-9_-]{16,128})\/?(?:[?#].*)?$/.exec(url)?.[1] ?? null;
}
