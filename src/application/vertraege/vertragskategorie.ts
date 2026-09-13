// Die Kategorie des Vertrags auf seine gebuchten Zahlungen übertragen — rückwirkend.
//
// Der Fall: man erfasst einen Vertrag, der Abgleich ordnet ihm seine bisherigen Zahlungen
// zu (das tut er seit jeher), und die Zahlungen behalten trotzdem die Kategorie, die sie
// vorher hatten — oder gar keine. Die Zuordnung sagt „diese Buchung gehört zu diesem
// Vertrag", und die Kategorie steht daneben und widerspricht ihr. Im Bestand ist das der
// Regelfall: die Erkennung ordnet Jahre zurück zu, und die Kategorisierung von damals war
// eine andere.
//
// **Es passiert NICHT von selbst, und das ist der Kern der Entscheidung.** Eine
// Vertragszuordnung ist eine Aussage über die ZUGEHÖRIGKEIT; daraus automatisch die
// Kategorie umzuschreiben, hiesse, aus einer Zuordnung eine Massenänderung an gebuchten
// Daten zu machen — bei einem Abgleich, der bei jedem Öffnen des Vertragsbereichs läuft.
// Wer eine Zahlung bewusst anders einsortiert hat, verlöre das beim nächsten Hinsehen,
// ohne es zu merken. Deshalb hängt es an einem Haken, den jemand setzt.
//
// Was es dagegen ausdrücklich TUT, wenn der Haken steht: auch von Hand gesetzte
// Kategorien überschreiben. Genau das ist der Anlass, aus dem man ihn setzt — „ich habe
// das damals falsch einsortiert, der Vertrag weiss es besser". Ein Schutz der Handarbeit
// wäre hier ein Schutz gegen die Handlung, die gerade ausgelöst wurde.

import type { IstBuchung } from "../../core";
import { buchungenSammelbearbeiten } from "../buchung/buchungenSammelbearbeiten";
import type {
  KategorieRepository,
  LedgerPort,
  VertragRepository,
  VertragszuordnungRepository,
} from "../ports";

export interface VertragskategorieDeps {
  readonly ledger: LedgerPort;
  readonly zuordnungRepo: VertragszuordnungRepository;
  readonly vertragRepo: VertragRepository;
  readonly kategorieRepo: KategorieRepository;
}

export interface UebertragungErgebnis {
  /** Buchungen, deren Kategorie jetzt die des Vertrags ist. */
  readonly geaendert: number;
  /** Buchungen, die absichtlich stehenblieben — geteilt oder Umbuchungs-Bein. */
  readonly uebersprungen: number;
}

/**
 * Setzt die Kategorie des Vertrags auf alle Buchungen, die ihm zugeordnet sind.
 *
 * Geschrieben wird über `buchungenSammelbearbeiten` und nicht über eine eigene Schleife:
 * dort steht schon, was zu einer Kategorieänderung gehört — die Herkunft springt auf
 * `manuell` (sonst holte die Kategorie-Automatik den alten Wert zurück), der Charakter
 * folgt der neuen Kategorie, und ein Umbuchungs-Bein bleibt unangetastet. Eine zweite
 * Fassung davon würde driften, und die erste Abweichung fände niemand.
 *
 * Ohne Kategorie am Vertrag passiert NICHTS. „Übertragen" hiesse dann leeren, und das ist
 * eine andere Handlung als die, die der Haken anbietet.
 */
export async function vertragskategorieUebertragen(
  deps: VertragskategorieDeps,
  vertragId: string,
): Promise<UebertragungErgebnis> {
  const [vertraege, zuordnungen, buchungen, kategorien] = await Promise.all([
    deps.vertragRepo.alle(),
    deps.zuordnungRepo.alle(),
    deps.ledger.alle(),
    deps.kategorieRepo.alle(),
  ]);

  const kategorieId = vertraege.find((v) => v.id === vertragId)?.kategorieId;
  if (!kategorieId) return { geaendert: 0, uebersprungen: 0 };

  const gehoertDazu = new Set(
    zuordnungen.filter((z) => z.vertragId === vertragId).map((z) => z.istbuchungId),
  );

  // GETEILTE Buchungen bleiben draussen, und das ist keine Vorsicht, sondern die
  // Fachlichkeit: bei einer Aufteilung stehen die Kategorien in den TEILEN, und wer eine
  // Zahlung aufgeteilt hat, hat sie absichtlich auf mehrere verteilt. Die Kopfkategorie
  // umzuschreiben liesse die Teile stehen und erzeugte einen Widerspruch, den die
  // Budgetrechnung danach je nach Weg verschieden auflöst.
  const betroffen: IstBuchung[] = [];
  let uebersprungen = 0;
  for (const b of buchungen) {
    if (!gehoertDazu.has(b.id)) continue;
    if (b.aufteilungen && b.aufteilungen.length > 0) {
      uebersprungen++;
      continue;
    }
    if (b.kategorieId === kategorieId) continue;
    betroffen.push(b);
  }
  if (betroffen.length === 0) return { geaendert: 0, uebersprungen };

  const ergebnis = await buchungenSammelbearbeiten(
    deps.ledger,
    betroffen,
    { kategorieId },
    kategorien,
  );
  return {
    geaendert: ergebnis.geaendert,
    // Die Sammelbearbeitung überspringt Umbuchungs-Beine; beide Gründe zählen in dieselbe
    // Zahl, weil sie dasselbe bedeuten — „steht absichtlich noch so da".
    uebersprungen: uebersprungen + ergebnis.uebersprungen,
  };
}
