// Der Buchungsdialog braucht fast alles — und hat es sich bisher selbst geholt.
//
// Das ist die Datei mit den meisten Repositories im ganzen Projekt gewesen (acht), und
// der Grund ist echt: der Dialog zeigt eine Buchung MIT ihrem Zusammenhang. Herkunft aus
// dem Import, das Gegenbein einer Umbuchung, der Vertrag dahinter, Dublettenverdacht,
// die Kategorien zur Auswahl. Nur folgt daraus nicht, dass er sich das selbst zusammen-
// suchen muss.
//
// Alles LESENDE steht hier. Die Schreibfälle bleiben eigene Use-Cases (buchungErfassen,
// buchungSplitten, zuordnungVonHand …) — sie sind schon jeweils an ihrem Ort.

import type {
  IstBuchung,
  Kategorie,
  Vertrag,
  Vertragszuordnung,
  Zahlungskonto,
  Zahlungsregel,
} from "../core";
import type { ImportLauf, Umsatz } from "./import";
import {
  freigegebenePaare,
  ledgerVerdacht,
  type Dublettenfreigabe,
  type Dublettenverdacht,
} from "./dublettensicht";
import type {
  DublettenfreigabeRepository,
  ImportLaufRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
} from "./ports";

export interface BuchungsdetailDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly regelRepo: ZahlungsregelRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
  readonly ledger: LedgerPort;
  readonly vertragRepo: VertragRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
  readonly freigabeRepo: DublettenfreigabeRepository;
}

export interface Buchungsdetaildaten {
  readonly konten: readonly Zahlungskonto[];
  readonly kategorien: readonly Kategorie[];
  readonly regeln: readonly Zahlungsregel[];
  readonly umsaetze: readonly Umsatz[];
  readonly laeufe: readonly ImportLauf[];
  readonly buchungen: readonly IstBuchung[];
  readonly vertraege: readonly Vertrag[];
  readonly zuordnungen: readonly Vertragszuordnung[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  readonly kategorieNamen: ReadonlyMap<string, string>;
  /** Buchungs-ID → Umsatz. Empfänger, Zweck und Herkunft stehen dort. */
  readonly umsatzZuBuchung: ReadonlyMap<string, Umsatz>;
  /**
   * Buchungs-ID → Dublettenverdacht — DIESELBE Rechnung wie im Kontoauszug.
   *
   * Der Dialog hat sie sich lange selbst gerechnet, und zwar anders: gegen alle Umsätze
   * des Kontos, ohne zu prüfen, ob es die Gegenbuchung noch gibt. Ergebnis waren zwei
   * Auskünfte über dieselbe Buchung — im Auszug längst still, im Dialog weiter gemahnt.
   * Für einen noch nicht verbuchten ENTWURF gilt die andere Frage; die beantwortet
   * `entwurfVerdacht` (siehe dublettensicht.ts).
   */
  readonly dublettenverdacht: ReadonlyMap<string, Dublettenverdacht>;
  /** Die „ist kein Duplikat"-Entscheidungen, als Paarschlüssel. */
  readonly freigegeben: ReadonlySet<string>;
  readonly freigaben: readonly Dublettenfreigabe[];
}

export async function buchungsdetailLaden(
  deps: BuchungsdetailDeps,
): Promise<Buchungsdetaildaten> {
  const [konten, kategorien, regeln, umsaetze, laeufe, buchungen, vertraege, zuordnungen, freigaben] =
    await Promise.all([
      deps.kontoRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.regelRepo.alle(),
      deps.umsatzRepo.alle(),
      deps.laufRepo.alle(),
      deps.ledger.alle(),
      deps.vertragRepo.alle(),
      deps.zuordnungRepo.alle(),
      deps.freigabeRepo.alle(),
    ]);

  const umsatzZuBuchung = new Map<string, Umsatz>();
  for (const u of umsaetze) if (u.istbuchungId) umsatzZuBuchung.set(u.istbuchungId, u);

  const freigegeben = freigegebenePaare(freigaben);

  return {
    konten, kategorien, regeln, umsaetze, laeufe, buchungen, vertraege, zuordnungen,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    kategorieNamen: new Map(kategorien.map((k) => [k.id, k.name])),
    umsatzZuBuchung,
    dublettenverdacht: ledgerVerdacht(umsaetze, new Set(buchungen.map((b) => b.id)), freigegeben),
    freigegeben,
    freigaben,
  };
}
