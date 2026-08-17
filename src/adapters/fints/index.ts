// Öffentliche Oberfläche des FinTS-Adapters. Die UI importiert von hier — und bekommt
// damit nie `lib-fints` selbst zu sehen, sondern nur den Port aus `application/fints`.

import { APP_VERSION } from "../../version";
import { fintsAdapter } from "./fintsAdapter";

export * from "./uebersetzung";
export { bankEndpunktFreigeben, transportInstallieren, transportEntfernen } from "./transport";

/**
 * Die DK-Produktregistrierungsnummer identifiziert das PRODUKT, nicht den Nutzer, und geht
 * bei jeder Dialoginitialisierung im Klartext an die Bank. Sie ist damit kein Geheimnis —
 * sie steht trotzdem nicht im Quelltext, sondern in der Build-Konfiguration:
 *
 *  • öffentlicher Quelltext machte sie zur Copy-Paste-Vorlage, und
 *  • ein Fork ist ohnehin ein anderes Produkt, das sich eigenständig registrieren muss.
 *
 * Fehlt sie, verweigert der Adapter den Abruf mit klarem Hinweis (siehe `anmelden`) —
 * er sendet niemals eine erfundene oder fremde Nummer.
 */
const PRODUKT_ID = import.meta.env.VITE_FINTS_PRODUKT_ID ?? "";

export const fintsAbruf = fintsAdapter({
  produktId: PRODUKT_ID,
  // Die Bank erlaubt maximal 5 Zeichen; der Adapter kürzt, die Quelle bleibt die
  // App-Version.
  produktVersion: APP_VERSION,
});

/** Ob überhaupt eine Produktnummer hinterlegt ist — für den Hinweis in der Oberfläche. */
export const fintsEinsatzbereit = PRODUKT_ID.length > 0;
