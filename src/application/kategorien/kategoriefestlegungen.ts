// Use-Cases der Kategorie-Festlegungen — anlegen und aufheben.
//
// Wenig Code, eigene Stelle: hier wird das Muster in die Form gebracht, in der es
// gespeichert wird, und hier kommt die Uhr rein. Beides direkt aus der UI zu machen hieße,
// es an jeder aufrufenden Stelle nochmal zu machen — und die Stellen sind bereits drei
// (Review-Inbox, Buchungsdialog, Einstellungsliste).

import { festlegungTrifft, musterVorschlag, type Kategorie, type Kategoriefestlegung } from "../../core";
import { kategorisieren, type Umsatz } from "../import";
import type { KategoriefestlegungRepository, UmsatzRepository } from "../ports";

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

/**
 * Eine Festlegung setzen UND sie sofort auf die offenen Zeilen anwenden.
 *
 * Beides zusammen, weil es fachlich ein Vorgang ist: „immer bei diesem Empfänger" meint
 * auch die Zeilen, die gerade im Stapel liegen. Stand die Schleife in der Oberfläche,
 * musste sie `festlegungTrifft` kennen und die Ausnahmen mitführen (Handentscheidungen
 * und Umbuchungen bleiben unangetastet) — eine Regel an einem Ort, an dem sie niemand
 * vermutet.
 *
 * Liefert, auf wie viele WEITERE Zeilen die Festlegung gegriffen hat.
 */
export async function festlegungAnwenden(
  deps: {
    readonly festlegungRepo: KategoriefestlegungRepository;
    readonly umsatzRepo: UmsatzRepository;
  },
  muster: string,
  kategorie: Kategorie,
  offene: readonly Umsatz[],
  /** Die Zeile, aus der das Angebot entstand — sie ist schon kategorisiert. */
  ausserId: string,
): Promise<number> {
  const f = await festlegungSetzen(deps.festlegungRepo, muster, kategorie.id);
  if (!f) return 0;
  let weitere = 0;
  for (const x of offene) {
    if (x.id === ausserId) continue;
    // Handentscheidungen und Umbuchungen sind für jede Automatik tabu.
    if (x.vorschlag?.quelle === "manuell" || x.vorschlag?.quelle === "umbuchung") continue;
    if (x.vorschlag?.kategorieId === kategorie.id) continue;
    if (!festlegungTrifft(f, x.gegenpartei)) continue;
    await deps.umsatzRepo.speichern(
      kategorisieren(x, {
        kategorieId: kategorie.id,
        charakter: kategorie.defaultCharakter,
        quelle: "festlegung",
      }),
    );
    weitere++;
  }
  return weitere;
}
