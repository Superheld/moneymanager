// Fachlicher Fehler (ADR-0004) — Validierungs-/Geschäftsregelverstöße tragen einen
// stabilen CODE statt eines festen Textes. So bleibt die Anwendungsschicht sprachfrei;
// die UI übersetzt den Code über den i18n-Namespace `fehler`. message = code, damit ein
// durchgereichter Fehler in Logs identifizierbar bleibt.

export class FachlicherFehler extends Error {
  constructor(
    public readonly code: string,
    public readonly werte?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "FachlicherFehler";
  }
}
