export const USERNAME_KEY = "accountability_username";

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function getStoredUsername() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USERNAME_KEY);
}

export function setStoredUsername(username: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERNAME_KEY, username);
}

export function clearStoredUsername() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USERNAME_KEY);
}