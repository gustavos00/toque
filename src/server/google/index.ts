// Google account connection (OAuth + tokens). The calendar module
// (src/server/calendar) uses getGoogleAccessToken() and the google_connection
// row (calendar_id, last_sync_at, last_error).

export {
  decryptSecret,
  encryptSecret,
  getEncryptionKey,
  getEncryptionKeyProblem,
} from "./crypto";
export {
  deleteGoogleConnection,
  getGoogleAccessToken,
  getGoogleConnection,
  getGoogleRefreshToken,
  isGoogleConnected,
  saveGoogleConnection,
  setGoogleLastError,
} from "./connection";
export {
  buildGoogleAuthUrl,
  createGoogleState,
  exchangeGoogleCode,
  getGoogleCredentials,
  getGoogleRedirectUri,
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_SCOPES,
  GoogleAuthError,
  isGoogleConfigured,
  isGoogleStateValid,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  type FetchFn,
  type GoogleTokens,
} from "./oauth";
export { buildGoogleStatus, TOQUE_CALENDAR_NAME } from "./status";
