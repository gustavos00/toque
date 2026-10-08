// Appearance preference, kept on this device only (localStorage + cookie),
// never in the server settings. Light is the default.

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "toque-theme";
const LIGHT_THEME_COLOR = "#f2f2f7";
const DARK_THEME_COLOR = "#000000";

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function getStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Storage blocked (private mode): fall through to the cookie.
  }
  const cookie = document.cookie.match(/(?:^|; )toque-theme=([^;]+)/)?.[1];
  return isTheme(cookie) ? cookie : "light";
}

/** Applies the theme to <html> and the status-bar colour. */
export function applyTheme(theme: Theme) {
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Cookie below still remembers it.
  }
  document.cookie = `${THEME_STORAGE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
  applyTheme(theme);
}

/**
 * Inline script for <head>: runs before first paint, so there is no flash of
 * the wrong theme. Mirrors getStoredTheme + applyTheme, and follows the system
 * live when the preference is "system".
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}",t=null;try{t=localStorage.getItem(k)}catch(e){}if(!t){var m=document.cookie.match(/(?:^|; )${THEME_STORAGE_KEY}=([^;]+)/);t=m&&m[1]}if(t!=="dark"&&t!=="system")t="light";var q=window.matchMedia("(prefers-color-scheme: dark)");var f=function(){var c=localStorage.getItem(k)||t;var d=c==="dark"||(c==="system"&&q.matches);document.documentElement.classList.toggle("dark",d);var el=document.querySelector('meta[name="theme-color"]');if(el)el.setAttribute("content",d?"${DARK_THEME_COLOR}":"${LIGHT_THEME_COLOR}")};f();document.addEventListener("DOMContentLoaded",f);q.addEventListener("change",f)}catch(e){}})();`;
