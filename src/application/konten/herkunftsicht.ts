// Woher die Zeilen eines Kontos kommen — die Rohdaten hinter den Buchungen.
//
// Der Auszug zeigt, was IM KONTO steht. Diese Sicht zeigt, was HEREINKAM: jede Zeile, die
// je für dieses Konto eingelesen wurde, mit ihrem Lauf und ihrem Schicksal. Das ist die
// Frage „woher weiss die App das", und sie ist heute nirgends beantwortbar.
//
// Zwei Dinge waren bisher unsichtbar, obwohl sie gespeichert sind:
//
//  • **Die weggelegten Zeilen.** Sie stehen mit Status `verworfen` oder `duplikat` in der
//    Datenbank, angezeigt wurden sie nur in der Import-Inbox — und dort nur die aus
//    DATEI-Läufen, nach Konto gefiltert wurde nie.
//  • **Die Abruf-Historie.** Jeder Lauf ist protokolliert, mit Zeitpunkt und Zählern.
//    Gesehen hat man ihn nur einmal, im Dialog direkt nach dem Abruf.
//
// **Warum die Läufe gruppiert werden.** Der Rückgriff holt bei jedem Abruf einige Tage
// doppelt, damit nachgetragene Buchungen nicht verlorengehen. Die Folge: die MEHRHEIT
// aller Läufe bringt nichts Neues — sie holen, vergleichen, verwerfen. Eine Liste, die
// jeden Lauf gleich gross zeigt, besteht deshalb überwiegend aus Rauschen, und die
// wenigen Läufe, bei denen etwas passiert ist, gehen darin unter.

import type { Zahlungskonto } from "../../core";
import type { ImportLauf, Umsatz } from "../import";
import type {
  ImportLaufRepository,
  LedgerPort,
  UmsatzRepository,
  ZahlungskontoRepository,
} from "../ports";

/** Was ein Lauf FÜR DIESES KONTO gebracht hat — nicht insgesamt. */
export interface Laufbefund {
  readonly lauf: ImportLauf;
  /** Zeilen dieses Kontos aus diesem Lauf. */
  readonly zeilen: number;
  readonly verbucht: number;
  readonly weggelegt: number;
  readonly offen: number;
}

/** Eine Rohzeile mit dem, was aus ihr geworden ist. */
export interface Herkunftszeile {
  readonly umsatz: Umsatz;
  readonly lauf?: ImportLauf;
  /**
   * Steht die erzeugte Ist-Buchung noch im Ledger?
   *
   * Nicht dasselbe wie `status === "verbucht"`: eine gelöschte Buchung lässt den Umsatz
   * zurück, und dann behauptet der Status etwas, das nicht mehr stimmt. Genau diese
   * Diskrepanz will man hier sehen können.
   */
  readonly gebucht: boolean;
}

export interface Kontoherkunft {
  readonly konto: Zahlungskonto;
  /** Läufe mit Zeilen dieses Kontos, neueste zuerst. */
  readonly laeufe: readonly Laufbefund[];
  /** Alle Rohzeilen dieses Kontos, neueste zuerst. */
  readonly zeilen: readonly Herkunftszeile[];
}

export interface HerkunftDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
  readonly ledger: LedgerPort;
}

export async function herkunftLaden(deps: HerkunftDeps): Promise<Kontoherkunft[]> {
  const [konten, umsaetze, laeufe, buchungen] = await Promise.all([
    deps.kontoRepo.alle(),
    deps.umsatzRepo.alle(),
    deps.laufRepo.alle(),
    deps.ledger.alle(),
  ]);

  const laufJeId = new Map(laeufe.map((l) => [l.id, l]));
  const gebuchteIds = new Set(buchungen.map((b) => b.id));

  const jeKonto = new Map<string, Umsatz[]>();
  for (const u of umsaetze) {
    const liste = jeKonto.get(u.zahlungskontoId);
    if (liste) liste.push(u);
    else jeKonto.set(u.zahlungskontoId, [u]);
  }

  return konten.map((konto) => {
    // Neueste zuerst: wer hier hereinschaut, sucht meistens etwas Jüngeres. Bei gleichem
    // Tag entscheidet die Id, damit die Reihenfolge zwischen zwei Aufrufen stabil bleibt.
    const eigene = [...(jeKonto.get(konto.id) ?? [])].sort(
      (a, b) => b.buchungstag.localeCompare(a.buchungstag) || b.id.localeCompare(a.id),
    );

    return {
      konto,
      laeufe: laufbefunde(eigene, laufJeId),
      zeilen: eigene.map((umsatz) => ({
        umsatz,
        lauf: laufJeId.get(umsatz.laufId),
        gebucht: !!umsatz.istbuchungId && gebuchteIds.has(umsatz.istbuchungId),
      })),
    };
  });
}

function laufbefunde(
  umsaetze: readonly Umsatz[],
  laufJeId: ReadonlyMap<string, ImportLauf>,
): Laufbefund[] {
  const zaehler = new Map<string, { zeilen: number; verbucht: number; weggelegt: number; offen: number }>();
  for (const u of umsaetze) {
    const z = zaehler.get(u.laufId) ?? { zeilen: 0, verbucht: 0, weggelegt: 0, offen: 0 };
    z.zeilen++;
    if (u.status === "verbucht") z.verbucht++;
    else if (u.status === "neu") z.offen++;
    else z.weggelegt++; // verworfen und duplikat: beides „liegt da, zählt nicht mit"
    zaehler.set(u.laufId, z);
  }

  return [...zaehler]
    .flatMap(([laufId, z]) => {
      const lauf = laufJeId.get(laufId);
      // Ein Lauf ohne Protokoll ist eine Altlast, kein Fehler — er wird übergangen statt
      // mit einem leeren Platzhalter angezeigt.
      return lauf ? [{ lauf, ...z }] : [];
    })
    .sort((a, b) => b.lauf.zeitpunkt.localeCompare(a.lauf.zeitpunkt));
}
