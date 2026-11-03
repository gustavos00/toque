// Where the session token lives: the iOS keychain. `token-store.web.ts` is the
// browser stand-in Metro picks for the web build (SecureStore has none).

import * as SecureStore from "expo-secure-store";

export const readStoredToken = (key: string) => SecureStore.getItemAsync(key);
export const writeStoredToken = (key: string, value: string) =>
  SecureStore.setItemAsync(key, value);
export const deleteStoredToken = (key: string) => SecureStore.deleteItemAsync(key);
