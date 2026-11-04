import { useSyncExternalStore } from "react";

/**
 * The visitor's advertising choice. Stored in this browser only (local storage, no cookie, never sent to us), like the
 * theme choice. Nothing from Google loads while the choice is `unset` or `denied`. We ask every visitor, whatever their
 * country, because we do not locate visitors; this is NOT a Google-certified consent platform (see
 * docs/engineering/ADSENSE_SITE_VERIFICATION.md for what the EEA, UK and Switzerland still need).
 */
export type AdConsent = "unset" | "granted" | "denied";
export const AD_CONSENT_KEY = "upnext-ad-consent";

export function readAdConsent(): AdConsent {
  try {
    const value = window.localStorage.getItem(AD_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "unset"; // blocked storage: treated as no consent
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function setAdConsent(choice: "granted" | "denied") {
  try {
    window.localStorage.setItem(AD_CONSENT_KEY, choice);
  } catch {
    /* storage blocked: the choice is not remembered and advertising stays off */
    if (choice === "granted") return;
  }
  listeners.forEach((listener) => listener());
}

export function useAdConsent(): AdConsent {
  return useSyncExternalStore(subscribe, readAdConsent, () => "unset" as AdConsent);
}
