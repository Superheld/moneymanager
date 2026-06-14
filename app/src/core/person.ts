// Person — Mitglied des Haushalts, ab Tag 1 als Entität (KONZEPT §3.5), auch bei
// nur einem Zugang. Zuordnungsdimension für Konten-Inhaberschaft, später Vorsorge.

export interface Person {
  readonly id: string;
  readonly name: string;
  /** Optional, ISO „YYYY-MM-DD" — für Vorsorge in Stufe 2. */
  readonly geburtsdatum?: string;
  /** Freie Rollenbeschreibung im Haushalt, z. B. „Inhaberin · Vollzeit". */
  readonly rolle?: string;
}
