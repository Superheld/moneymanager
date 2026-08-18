// Transport für FinTS — die Stelle, an der der Abruf sonst scheitert.
//
// FinTS PIN/TAN ist ein HTTPS-POST mit base64-kodiertem Nachrichtenblob an den
// Bankendpunkt. Zwei Dinge stehen dem aus der Webview im Weg:
//
//  1. **CORS.** Banken senden kein `Access-Control-Allow-Origin`, der POST stirbt im
//     Browser-Sicherheitsmodell. `@tauri-apps/plugin-http` liefert ein API-kompatibles
//     `fetch`, das durch Rust läuft und deshalb kein CORS kennt. Das bleibt „Tauri = nur
//     Hülle" (ADR-0001): reiner Transport, keine Domänenlogik.
//  2. **`Buffer`.** `lib-fints` benutzt in `httpClient.js` das GLOBALE `Buffer` für die
//     Umrechnung latin1↔base64 — ohne Import, es setzt Node voraus. Vier Stellen, sonst
//     keine Node-Berührung. Das `buffer`-Paket füllt das im Browser auf.
//
// `lib-fints` hat für den Transport keinen Injektionspunkt: `Dialog.getHttpClient()`
// konstruiert hart `new HttpClient(url)`, und der greift auf das globale `fetch` zu.
// Die einzige Naht ist damit `globalThis.fetch` selbst. Das ist bewusst KEIN Patch an der
// Bibliothek (Leitentscheidung „was die Bibliothek kann, kann die App"; und Änderungen an
// einer LGPL-Bibliothek blieben LGPL) — es ist die Tür, die sie offen lässt.
//
// Umgebogen wird eng gescopt: nur ausdrücklich freigegebene Bank-Endpunkte laufen über
// Tauri, alles andere (Vite-HMR, künftige App-Aufrufe) geht unverändert an das echte
// `fetch`. Ein global ersetztes `fetch` wäre die Sorte Nebenwirkung, die man ein halbes
// Jahr später nicht mehr findet.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { Buffer } from "buffer";

/** Endpunkte, die über den Tauri-Transport laufen dürfen. Nur Origin-Vergleich. */
const freigegebeneOrigins = new Set<string>();

let installiert = false;
let echtesFetch: typeof globalThis.fetch | null = null;

function originVon(url: string): string {
  return new URL(url).origin;
}

/**
 * Gibt einen Bank-Endpunkt für den Tauri-Transport frei. Muss VOR dem ersten Dialog
 * aufgerufen werden — sonst läuft die Nachricht ins CORS.
 *
 * Zusätzlich muss die URL in `src-tauri/capabilities/default.json` stehen; die Freigabe
 * hier ist nur die Seite in der Webview. Fehlt sie dort, antwortet der Plugin-Aufruf mit
 * einem Berechtigungsfehler statt mit der Bank.
 */
export function bankEndpunktFreigeben(url: string): void {
  freigegebeneOrigins.add(originVon(url));
  transportInstallieren();
}

/**
 * Legt den Umleiter über `globalThis.fetch`. Idempotent — mehrfaches Aufrufen hängt keine
 * zweite Schicht davor.
 */
export function transportInstallieren(): void {
  if (installiert) return;
  installiert = true;

  if (!(globalThis as { Buffer?: unknown }).Buffer) {
    (globalThis as { Buffer?: unknown }).Buffer = Buffer;
  }

  echtesFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((eingabe: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof eingabe === "string" ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url;
    let gehoertZurBank = false;
    try {
      gehoertZurBank = freigegebeneOrigins.has(originVon(url));
    } catch {
      gehoertZurBank = false; // relative URL o. Ä. — nie Bank
    }
    return gehoertZurBank ? tauriFetch(url, init) : echtesFetch!(eingabe, init);
  }) as typeof globalThis.fetch;
}

/** Nimmt den Umleiter wieder heraus. Für Tests; im App-Betrieb bleibt er stehen. */
export function transportEntfernen(): void {
  if (!installiert) return;
  if (echtesFetch) globalThis.fetch = echtesFetch;
  echtesFetch = null;
  installiert = false;
  freigegebeneOrigins.clear();
}
