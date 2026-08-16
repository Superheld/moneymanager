// Use-Cases der Kategorie-Festlegungen — anlegen und aufheben.
//
// Wenig Code, eigene Stelle: hier wird das Muster in die Form gebracht, in der es
// gespeichert wird, und hier kommt die Uhr rein. Beides direkt aus der UI zu machen hieße,
// es an jeder aufrufenden Stelle nochmal zu machen — und die Stellen sind bereits drei
// (Review-Inbox, Buchungsdialog, Einstellungsliste).

import { musterVorschlag, type Kategoriefestlegung } from "../core";
import type { KategoriefestlegungRepository } from "./ports";

/**
 * „Immer bei diesem Empfänger": legt fest, dass Zahlungen auf dieses Muster diese
 * Kategorie bekommen. Ein zweiter Aufruf mit demselben Muster ersetzt die alte Aussage.
 *
 * Liefert `null`, wenn das Muster leer ist — dann gibt es nichts festzulegen, und eine
 * leere Zeile in der Liste wäre eine Regel, die alles oder nichts trifft.
 */
export async function festlegungSetzen(
  repo: KategoriefestlegungRepository,
  muster: string,
  kategorieId: string,
  jetzt: () => string = () => new Date().toISOString(),
): Promise<Kategoriefestlegung | null> {
  const sauber = muster.trim().toLowerCase();
  if (!sauber || !kategorieId) return null;
  const f: Kategoriefestlegung = { muster: sauber, kategorieId, angelegtAm: jetzt() };
  await repo.speichern(f);
  return f;
}

/** Die Festlegung fällt weg; ab dann entscheidet wieder das Modell. */
export async function festlegungAufheben(
  repo: KategoriefestlegungRepository,
  muster: string,
): Promise<void> {
  await repo.loeschen(muster);
}

/**
 * Was die UI anbieten soll, wenn jemand die Kategorie einer Zahlung korrigiert hat:
 * das Muster für diesen Empfänger — oder `null`, wenn es dafür schon eine Festlegung mit
 * derselben Kategorie gibt. Das Angebot zu wiederholen, wenn es bereits angenommen wurde,
 * ließe den Eindruck entstehen, es hätte nicht gewirkt.
 */
export function festlegungAngebot(
  bestand: readonly Kategoriefestlegung[],
  gegenpartei: string,
  kategorieId: string,
): string | null {
  const muster = musterVorschlag(gegenpartei);
  if (!muster || !kategorieId) return null;
  const vorhanden = bestand.find((f) => f.muster === muster);
  return vorhanden?.kategorieId === kategorieId ? null : muster;
}
