"use client";

import { useEffect } from "react";

// Enregistré seulement en production : en développement, le cache masquerait les modifications
export function EnregistrerServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
