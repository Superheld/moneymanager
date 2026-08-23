// Verträge-Sicht — je Vertrag alles, was die Liste über ihn zeigt.
//
// Es sind viele kleine Ableitungen (nächste Fälligkeit, Kündigungstermin, wie viele
// Zahlungen zugeordnet sind, was er im Monat kostet), und jede einzelne wäre in einer
// Tabellenspalte harmlos. Zusammen sind sie das, was die Oberfläche wissen müsste, um
// die Fachlogik nachzubauen — also gehören sie hierher.
//
// Der Ladevorgang bringt den Bestand zuerst auf Stand: Erkennungen nachziehen, dann
// zuordnen. Beides ist billig, wenn nichts zu tun ist (Nachziehen fasst Vorhandenes
// nicht an, der Abgleich schreibt nur Deltas) — und die Alternative wäre, dass der
// Bestand blind bleibt, bis jemand einen Vertrag anfasst.

import {
  erkennungsDiagnose,
  kuendigungsterminNaht,
  naechsteFaelligkeit,
  naechsterKuendigungstermin,
  ruecklageProMonat,
  passtZu,
  ruecklagenbedarf,
  RHYTHMUS_MONATE,
  type Cent,
  type IstBuchung,
  type Kategorie,
  type Kuendigungstermin,
  type Person,
  type Vertrag,
  type Erkennungsdiagnose,
  type Vertragserkennung,
  type Vertragskandidat,
  type Zahlungsspur,
  type Zahlungsregel,
} from "../../core";
import { erkennungenNachziehen, zuordnungenAbgleichen, type AbgleichDeps } from "./vertragszuordnung";
import { ignorierteSchluessel, vertragsvorschlaege } from "./vertragsvorschlaege";
import type {
  EinstellungenRepository,
  KategorieRepository,
  LedgerPort,
  PersonRepository,
  UmsatzRepository,
  VertragRepository,
  VertragserkennungRepository,
  VertragszuordnungRepository,
  ZahlungsregelRepository,
} from "../ports";

export interface VertragsichtDeps {
  readonly vertragRepo: VertragRepository;
  readonly regelRepo: ZahlungsregelRepository;
  readonly personRepo: PersonRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly erkennungRepo: VertragserkennungRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
  readonly ledger: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
  readonly einstellungenRepo: EinstellungenRepository;
  /** Für den Abgleich, der vor dem Anzeigen läuft. */
  readonly abgleich: AbgleichDeps;
}

/** Ein Vertrag mit allem, was die Liste über ihn zeigt. */
export interface Vertragszeile {
  readonly vertrag: Vertrag;
  /** Die abgeleitete Zahlungsregel, falls es eine gibt. */
  readonly regel?: Zahlungsregel;
  /** Nächste Fälligkeit aus der Regel — nicht aus dem Vertragsbeginn. */
  readonly naechsteZahlung: string | null;
  readonly kuendigungstermin: Kuendigungstermin | null;
  /** Steht der Kündigungstermin nah genug, um zu handeln? */
  readonly kuendigungNaht: boolean;
  /**
   * Wie viele gebuchte Zahlungen der Abgleich diesem Vertrag zugeordnet hat.
   *
   * Steht als Spalte in der Tabelle, weil die Automatik sonst unsichtbar bliebe: eine
   * Null sagt „die Regel greift nicht" — falscher Anbietername, zu enge Betragsspanne,
   * oder es gibt schlicht noch keine Zahlung. Ohne diese Zahl merkt man den Fehlgriff
   * erst, wenn irgendwo eine Auswertung nicht stimmt.
   */
  readonly zahlungen: number;
  /**
   * Die zugeordneten Zahlungen selbst — für die Liste, die sich unter der Vertragszeile
   * aufklappt.
   *
   * Die Zahl darüber sagt „die Regel greift", diese Liste sagt WAS sie greift. Erst daran
   * sieht man einen Fehlgriff: eine fremde Zahlung an denselben Empfänger zählt genauso
   * mit und macht aus einer falschen Zuordnung eine gute Kennzahl.
   */
  readonly zahlungsliste: readonly IstBuchung[];
  /** Was ein nicht-monatlicher Abfluss im Monat kostet, obwohl er nicht abgeht. */
  readonly ruecklage: Cent;
}

export interface Vertragskennzahlen {
  readonly proMonat: Cent;
  readonly proJahr: Cent;
  readonly baldKuendbar: number;
  readonly ruecklage: Cent;
}

export interface Vertragssicht {
  readonly zeilen: readonly Vertragszeile[];
  readonly kennzahlen: Vertragskennzahlen;
  readonly personen: readonly Person[];
  readonly personNamen: ReadonlyMap<string, string>;
  readonly kategorien: readonly Kategorie[];
  readonly regeln: readonly Zahlungsregel[];
  readonly vorschlaege: readonly Vertragskandidat[];
}

export async function vertraegeLaden(
  deps: VertragsichtDeps,
  heute: string,
): Promise<Vertragssicht> {
  await erkennungenNachziehen(deps.vertragRepo, deps.regelRepo, deps.erkennungRepo);
  await zuordnungenAbgleichen(deps.abgleich);

  const [vertraege, regeln, personen, kategorien, zuordnungen, buchungen, ignoriert] =
    await Promise.all([
      deps.vertragRepo.alle(),
      deps.regelRepo.alle(),
      deps.personRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.zuordnungRepo.alle(),
      deps.ledger.alle(),
      ignorierteSchluessel(deps.einstellungenRepo),
    ]);

  const regelZuVertrag = new Map<string, Zahlungsregel>();
  for (const r of regeln) if (r.vertragId) regelZuVertrag.set(r.vertragId, r);

  // Die Zahlungen je Vertrag, neueste zuerst — dieselbe Ordnung wie überall sonst, wo
  // Buchungen stehen.
  const buchungJeId = new Map(buchungen.map((b) => [b.id, b]));
  const zahlungenJeVertrag = new Map<string, IstBuchung[]>();
  for (const z of zuordnungen) {
    if (!z.vertragId) continue;
    const b = buchungJeId.get(z.istbuchungId);
    if (!b) continue;
    const liste = zahlungenJeVertrag.get(z.vertragId) ?? [];
    liste.push(b);
    zahlungenJeVertrag.set(z.vertragId, liste);
  }
  for (const liste of zahlungenJeVertrag.values()) liste.sort((a, b) => b.datum.localeCompare(a.datum));

  const zeilen = vertraege.map((vertrag): Vertragszeile => {
    const regel = regelZuVertrag.get(vertrag.id);
    return {
      vertrag,
      regel,
      naechsteZahlung: regel ? naechsteFaelligkeit(regel, heute) : null,
      kuendigungstermin: naechsterKuendigungstermin(vertrag, heute),
      kuendigungNaht: kuendigungsterminNaht(vertrag, heute),
      zahlungen: zahlungenJeVertrag.get(vertrag.id)?.length ?? 0,
      zahlungsliste: zahlungenJeVertrag.get(vertrag.id) ?? [],
      ruecklage: regel ? ruecklageProMonat(regel) : 0,
    };
  });

  return {
    zeilen,
    kennzahlen: kennzahlenAus(zeilen),
    personen,
    personNamen: new Map(personen.map((p) => [p.id, p.name])),
    kategorien,
    regeln,
    // Die Vorschläge lesen den gesamten Buchungsbestand — deshalb zuletzt.
    vorschlaege: await vertragsvorschlaege(
      deps.ledger, deps.umsatzRepo, deps.vertragRepo, heute, { ignoriert },
    ),
  };
}

function kennzahlenAus(zeilen: readonly Vertragszeile[]): Vertragskennzahlen {
  let proMonat = 0;
  let baldKuendbar = 0;
  const eigeneRegeln: Zahlungsregel[] = [];
  for (const z of zeilen) {
    if (z.regel) {
      proMonat += z.regel.betrag / RHYTHMUS_MONATE[z.regel.rhythmus];
      eigeneRegeln.push(z.regel);
    }
    if (z.kuendigungNaht) baldKuendbar++;
  }
  return {
    proMonat: Math.round(proMonat),
    proJahr: Math.round(proMonat * 12),
    baldKuendbar,
    ruecklage: ruecklagenbedarf(eigeneRegeln),
  };
}


/**
 * Die Probe aufs Exempel für eine Erkennungsregel, die gerade bearbeitet wird: welche
 * Zahlungen sie trifft — und, wenn keine, WO die Kette abreisst.
 *
 * Beides gehört zusammen und deshalb in EINE Funktion. Ohne die Diagnose war die
 * Vorschau bei null Treffern stumm: das Muster konnte passen und trotzdem verschwand
 * alles an der Betragsspanne, die `standardErkennung` beim Anlegen mitgibt. Wer dann
 * `*ard*` tippte und nichts sah, schloss daraus, dass Platzhalter nicht funktionieren.
 * Sie tun es — nur ein Filter dahinter räumte auf.
 */
export interface Erkennungsprobe {
  /** Treffer, jüngste zuerst: beim Nachsteuern interessiert der aktuelle Stand. */
  readonly treffer: readonly Zahlungsspur[];
  readonly diagnose: Erkennungsdiagnose | null;
}

export function erkennungProbieren(
  regel: Vertragserkennung | null,
  spuren: readonly Zahlungsspur[],
): Erkennungsprobe {
  if (!regel || regel.merkmale.length === 0) return { treffer: [], diagnose: null };
  return {
    treffer: spuren
      .filter((s) => passtZu(regel, s))
      .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0)),
    diagnose: erkennungsDiagnose(regel, spuren),
  };
}
