// Öffentliche Oberfläche des zweiten Abrufwegs. Wer von hier importiert, bekommt nie die
// eingebettete Bibliothek zu sehen, sondern nur den Port aus `application/fints`.
//
// Anders als beim FinTS-Adapter gibt es hier keine Produktnummer, die vorhanden sein muss:
// Was dieser Weg braucht, hängt am ZUGANG (der Ausweis, den der Nutzer hinterlegt) und
// nicht an der Anwendung. Ob er überhaupt angeboten wird, entscheidet der
// Experimente-Schalter, nicht dieser Adapter.

export { HANSEATIC_QUELLE, betragZuCent, zuImportErgebnis, zuRohUmsatz } from "./uebersetzung";
export { HANSEATIC_ADAPTER_ID, hanseaticAdapter, zuBankkonto } from "./hanseaticAdapter";

import { hanseaticAdapter } from "./hanseaticAdapter";

/** Der einsatzbereite Adapter, wie ihn die Anwendung benutzt. */
export const hanseaticAbruf = hanseaticAdapter();
