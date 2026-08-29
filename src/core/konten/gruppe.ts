/**
 * Eine frei benannte Gruppe von Konten.
 *
 * **Sie ist eine SICHT, keine Rechenregel** — und das ist der Unterschied zur
 * `Kontoklasse`, den man kennen muss, bevor man hier etwas anbaut:
 *
 * | | beantwortet | wirkt auf |
 * |---|---|---|
 * | `Kontoklasse` | ist das Geld verfügbar? | die liquiden Mittel, also jede Rechnung darüber |
 * | `Kontogruppe` | was will ich zusammen ansehen? | nichts — sie bündelt nur |
 *
 * Die Klasse kennt drei feste Werte und entscheidet mit; eine Gruppe heißt, wie du sie
 * nennst, und entscheidet nichts. Deshalb darf ein Konto in mehreren Gruppen liegen
 * (Bargeld gehört zur Lebenshaltung UND zum Urlaubstopf), während es genau eine Klasse
 * hat. Wer eine Gruppe je eine Rechnung tragen lässt — „Gruppe X zählt als liquide" —,
 * baut eine zweite Wahrheit neben die Klasse, und ab dann sagen zwei Felder dasselbe
 * verschieden.
 *
 * Was für eine Gruppe trotzdem gilt: **Saldo und Buchungen gehören zusammen.** Wer die
 * Konten einer Gruppe summiert, muss ihre Buchungen mit derselben Liste filtern — sonst
 * zeigt ein Verlauf einen Stand, den es nie gab. Dieselbe Falle wie bei `istLiquide`,
 * festgehalten in `core/konten/konto.test.ts`.
 */
export interface Kontogruppe {
  readonly id: string;
  readonly bezeichnung: string;
  /** Die Mitglieder. Reihenfolge ohne Bedeutung; Dubletten gibt es nicht. */
  readonly kontoIds: readonly string[];
}

/**
 * Die Konten einer Gruppe, in der Reihenfolge der übergebenen Liste.
 *
 * Nimmt die KONTEN als Quelle und nicht die Ids: eine Id, zu der es kein Konto (mehr)
 * gibt, fällt damit von selbst heraus, statt als Loch weiterzureisen. Im Bestand hält das
 * der Fremdschlüssel sauber — hier stünde sonst trotzdem eine Annahme darüber.
 */
export function kontenDerGruppe<K extends { readonly id: string }>(
  gruppe: Pick<Kontogruppe, "kontoIds">,
  konten: readonly K[],
): K[] {
  const drin = new Set(gruppe.kontoIds);
  return konten.filter((k) => drin.has(k.id));
}

/** Liegt dieses Konto in dieser Gruppe? */
export function inGruppe(gruppe: Pick<Kontogruppe, "kontoIds">, kontoId: string): boolean {
  return gruppe.kontoIds.includes(kontoId);
}

/**
 * Die Gruppen, in denen ein Konto liegt.
 *
 * Für die Anzeige am Konto selbst: dort steht die Frage andersherum, und ohne diesen Weg
 * müsste jede Stelle über alle Gruppen laufen und selbst filtern.
 */
export function gruppenDesKontos(
  gruppen: readonly Kontogruppe[],
  kontoId: string,
): Kontogruppe[] {
  return gruppen.filter((g) => inGruppe(g, kontoId));
}
