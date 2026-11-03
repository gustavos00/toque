// Browser stand-in for the keychain, used only by the web build (screenshots and
// trying the app in a browser).

export const readStoredToken = async (key: string) => localStorage.getItem(key);
export const writeStoredToken = async (key: string, value: string) =>
  localStorage.setItem(key, value);
export const deleteStoredToken = async (key: string) => localStorage.removeItem(key);
