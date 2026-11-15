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
  beleglageFuer,
  belegspuren,
  erkennungsDiagnose,
  merkmaleAbleiten,
  merkmalsTreffer,
  kostenJeMonat,
  kuendigungsterminNaht,
  naechsteFaelligkeit,
  naechsterKuendigungstermin,
  ruecklageProMonat,
  passtZu,
  spannenVorschlag,
  pflichtenJeMonat,
  ruecklagenbedarf,
  vertragLaeuft,
  zuordnungskandidaten,
  type Zuordnungskandidat,
  type Cent,
  type IstBuchung,
  type Kategorie,
  type Kuendigungstermin,
  type Person,
  type Vertrag,
  type Erkennungsdiagnose,
  type Merkmalskandidat,
  type Merkmalstreffer,
  type Vertragserkennung,
  type Vertragskandidat,
  type Vertragszuordnung,
  type Zahlungsspur,
  type Zahlungsregel,
  standardErkennung,
  type Regelvorlage,
} from "../../core";
import { erkennungenNachziehen, zuordnungenAbgleichen, type AbgleichDeps } from "./vertragszuordnung";
import { ignorierteSchluessel, vertragsvorschlaege } from "./vertragsvorschlaege";
import { spurenAus } from "../buchung/zahlungsspuren";
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

/**
 * Eine Buchung, die zu einem Vertrag gehören könnte — der Kandidat aus dem Kern, ergänzt
 * um das, woran ein Mensch ihn wiedererkennt.
 *
 * Empfänger und Verwendungszweck stehen am Beleg und nicht an der Buchung, der Kern
 * rechnet ohne sie (er sucht ja gerade NICHT nach dem Namen). Wer die Zeile bestätigen
 * soll, braucht sie trotzdem: Datum und Betrag allein sagen bei zwei gleich hohen
 * Zahlungen im selben Monat nicht, welche gemeint ist.
 */
export interface Zuordnungsvorschlag extends Zuordnungskandidat {
  /** Leer bei einer von Hand erfassten Buchung — sie hat keinen Beleg. */
  readonly gegenpartei: string;
  readonly verwendungszweck: string;
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
  /**
   * Was der Vertrag den Monat kostet oder einbringt, vorzeichenbehaftet — der Betrag der
   * Regel auf die Monate ihres Rhythmus verteilt (`kostenJeMonat`).
   *
   * Steht NEBEN dem Betrag je Fälligkeit und ersetzt ihn nicht: der eine sagt, was am
   * Stichtag vom Konto geht, der andere, was der Vertrag kostet. Null, wenn es keine
   * Regel gibt oder der Vertrag beendet ist — er kostet dann nichts mehr.
   */
  readonly jeMonat: Cent;
  /**
   * Noch unentschiedene Buchungen, die nach Kategorie, Richtung, Höhe und Termin zu
   * diesem Vertrag gehören könnten (`zuordnungskandidaten`) — jüngste zuerst.
   *
   * Ein VORSCHLAG und keine Zuordnung: die Sicht schreibt davon nichts. Zugeordnet wird
   * erst auf einen Klick, von Hand. Der Abgleich ist an dieser Stelle schon gelaufen —
   * was hier steht, hat die Erkennungsregel also nicht gegriffen.
   */
  readonly kandidaten: readonly Zuordnungsvorschlag[];
}

/**
 * Die Kennzahlen über der Liste — dieselbe erste Stufe wie in der Übersicht.
 *
 * Bis 2026-11-15 stand hier EINE Summe „pro Monat" über alle Regeln: Einnahmen,
 * Ausgaben und Umbuchungen in einer Zahl. Sie beantwortete keine Frage — ein Gehalt
 * machte sie positiv, eine Sparrate drückte sie, und was die Verträge KOSTEN, stand
 * nirgends. Jetzt sind es die drei Zahlen, aus denen die Übersicht „nach den Pflichten"
 * bildet, über die Verträge als Plan gerechnet.
 */
export interface Vertragskennzahlen {
  /** Σ Kosten je Monat der laufenden Aufwands-Verträge, negativ. */
  readonly fixkostenJeMonat: Cent;
  /** Σ je Monat der laufenden Ertrags-Verträge. */
  readonly einnahmenJeMonat: Cent;
  /** Einnahmen minus Fixkosten. Umbuchungsverträge zählen in keines von beiden. */
  readonly nachPflichten: Cent;
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
  await erkennungenNachziehen(deps.vertragRepo, deps.regelRepo, deps.erkennungRepo, deps.abgleich);
  await zuordnungenAbgleichen(deps.abgleich);

  const [vertraege, regeln, personen, kategorien, zuordnungen, buchungen, ignoriert, umsaetze] =
    await Promise.all([
      deps.vertragRepo.alle(),
      deps.regelRepo.alle(),
      deps.personRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.zuordnungRepo.alle(),
      deps.ledger.alle(),
      ignorierteSchluessel(deps.einstellungenRepo),
      deps.umsatzRepo.alle(),
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

  // Über `spurenAus` und nicht über einen eigenen Join: dort steht, welcher Beleg für eine
  // Buchung spricht, wenn sie mehrere hat. Eine zweite Auswahl hier zeigte am Kandidaten
  // einen anderen Empfänger als die Erkennungsvorschau desselben Vertrags.
  const spurJeBuchung = new Map(spurenAus(buchungen, umsaetze).map((s) => [s.id, s]));

  const zeilen = vertraege.map((vertrag): Vertragszeile => {
    const regel = regelZuVertrag.get(vertrag.id);
    // Die Kategorie der Regel, ersatzweise die des Vertrags: sie steht an beiden, und bei
    // älteren Verträgen nur an einem. Auch ein beendeter Vertrag bekommt Vorschläge: seine
    // Zahlungen aus der Zeit, in der er lief, können genauso unzugeordnet sein.
    const kandidaten = regel
      ? zuordnungskandidaten(regel, buchungen, zuordnungen, regel.kategorieId ?? vertrag.kategorieId)
      : [];
    return {
      vertrag,
      regel,
      naechsteZahlung: regel ? naechsteFaelligkeit(regel, heute) : null,
      kuendigungstermin: naechsterKuendigungstermin(vertrag, heute),
      kuendigungNaht: kuendigungsterminNaht(vertrag, heute),
      zahlungen: zahlungenJeVertrag.get(vertrag.id)?.length ?? 0,
      zahlungsliste: zahlungenJeVertrag.get(vertrag.id) ?? [],
      ruecklage: regel ? ruecklageProMonat(regel) : 0,
      jeMonat: regel && vertragLaeuft(vertrag) ? kostenJeMonat(regel) : 0,
      kandidaten: kandidaten.map((k) => ({
        ...k,
        gegenpartei: spurJeBuchung.get(k.buchung.id)?.gegenpartei ?? "",
        verwendungszweck: spurJeBuchung.get(k.buchung.id)?.verwendungszweck ?? "",
      })),
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
  let baldKuendbar = 0;
  const eigeneRegeln: Zahlungsregel[] = [];
  for (const z of zeilen) {
    if (z.regel) eigeneRegeln.push(z.regel);
    if (z.kuendigungNaht) baldKuendbar++;
  }
  const pflichten = pflichtenJeMonat(zeilen);
  return {
    fixkostenJeMonat: pflichten.fixkosten,
    einnahmenJeMonat: pflichten.einnahmen,
    nachPflichten: pflichten.nachPflichten,
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
  /**
   * Je Merkmal, was es FUER SICH trifft — in der Reihenfolge, in der die Merkmale stehen.
   *
   * Gehoert in dieselbe Funktion wie Treffer und Diagnose, aus demselben Grund: es sind
   * drei Antworten auf dieselbe Frage („woran haengt diese Regel"), und wer sie getrennt
   * holt, holt sie irgendwann gegen verschiedene Staende. Anders als die Diagnose zaehlt
   * das hier OHNE Betrag, Zeitraum und Konto — siehe `merkmalsTreffer` im Kern.
   */
  readonly proMerkmal: readonly Merkmalstreffer[];
  /**
   * Welche Betragsspanne alle Zahlungen fassen würde, die die Merkmale treffen.
   *
   * Nur gesetzt, wenn die vorhandene Spanne tatsächlich etwas wegnimmt — sonst böte die
   * Oberfläche eine Handlung an, die nichts ändert. Das ist dieselbe Regel wie beim
   * `anfangsbestandVorschlag` im Kontoabgleich.
   */
  readonly spanne?: { von: Cent; bis: Cent };
}

/**
 * Die Vertrags-Id einer Regel, die es noch nicht gibt.
 *
 * Eine Erkennung braucht sie als Feld, ein Entwurf hat aber noch keinen Vertrag. Zum
 * Probieren spielt sie keine Rolle — `erkennungProbieren` fragt nur, welche Zahlungen die
 * Merkmale treffen. Beim Speichern setzt der Aufrufer die echte ein; dieser Wert erreicht
 * den Bestand nie.
 */
export const ENTWURF_VERTRAG_ID = "entwurf";

/**
 * Die Regel, die für einen noch nicht angelegten Vertrag ENTSTEHEN würde.
 *
 * Sie gibt es, damit die Maske beim Anlegen dasselbe zeigen kann, was `vertragAnlegen`
 * sonst still im Hintergrund schreibt. Bis 2026-09-13 erschien der Erkennungsabschnitt
 * erst beim Bearbeiten: wer einen Vertrag von Hand erfasste, bekam eine Regel
 * zugeschrieben, ohne sie je zu sehen — und kam erst nach dem Speichern und erneuten
 * Öffnen an sie heran.
 *
 * Dieselbe Funktion wie beim Speichern (`standardErkennung`), damit Vorschau und Ergebnis
 * nicht auseinanderlaufen können. Zwei Fassungen davon wären zwei Regeln, die zufällig
 * gleich aussehen, bis eine von beiden angefasst wird.
 */
export function erkennungsentwurf(
  anbieter: string,
  betrag: Cent,
  glaeubigerId?: string,
  vorlage?: Regelvorlage,
): Vertragserkennung {
  return standardErkennung(ENTWURF_VERTRAG_ID, anbieter, betrag, glaeubigerId, vorlage);
}

export function erkennungProbieren(
  regel: Vertragserkennung | null,
  spuren: readonly Zahlungsspur[],
): Erkennungsprobe {
  if (!regel || regel.merkmale.length === 0) return { treffer: [], diagnose: null, proMerkmal: [] };
  const diagnose = erkennungsDiagnose(regel, spuren);
  // Nur vorschlagen, wenn die Betragsstufe wirklich etwas wegnimmt. Bei einer Regel, die
  // ohnehin alles durchlässt, wäre der Vorschlag eine Antwort auf eine ungestellte Frage.
  const spanne = diagnose.nachBetrag < diagnose.nachMerkmalen
    ? spannenVorschlag(regel, spuren)
    : undefined;
  return {
    treffer: spuren
      .filter((s) => passtZu(regel, s))
      .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0)),
    diagnose,
    spanne,
    proMerkmal: merkmalsTreffer(regel.merkmale, spuren),
  };
}

/**
 * Was in die Merkmalsliste eines Vertrags gehoerte, aus seinen von Hand zugeordneten
 * Zahlungen abgeleitet.
 *
 * Die Gegenrichtung zu `erkennungProbieren`: dort wird eine getippte Regel gemessen, hier
 * kommt aus den Belegen ein Vorschlag. Beide rechnen ueber DENSELBEN Spuren und mit
 * derselben Messung — sonst stuende neben einem Vorschlag eine Trefferzahl, die nach dem
 * Uebernehmen eine andere waere.
 *
 * Rein und ohne IO: die Spuren hat der Aufrufer ohnehin schon (die Vorschau braucht sie),
 * und die Zuordnungen sind eine Liste, kein Join. Ein eigener Ladeweg hier hiesse, den
 * Vorschlag gegen einen anderen Stand zu rechnen als die Vorschau daneben.
 */
export interface Merkmalsvorschlag {
  /**
   * Wie viele Zahlungen von Hand diesem Vertrag zugeordnet sind.
   *
   * Steht daneben, weil `decktAb` allein nichts sagt: „deckt 3" ist bei vier Belegen fast
   * alles und bei dreissig fast nichts. Und die Null unterscheidet die beiden Faelle, die
   * in der Oberflaeche sonst gleich aussaehen — „noch nichts zugeordnet" ist eine
   * Anleitung, „nichts Gemeinsames gefunden" ein Befund.
   */
  readonly belege: number;
  readonly kandidaten: readonly Merkmalskandidat[];
}

export function merkmaleVorschlagen(
  vertragId: string,
  spuren: readonly Zahlungsspur[],
  zuordnungen: readonly Vertragszuordnung[],
): Merkmalsvorschlag {
  const beleglage = beleglageFuer(vertragId, zuordnungen);
  return {
    // Ueber `belegspuren` und nicht ueber die Menge: eine Zuordnung kann auf eine Buchung
    // zeigen, die es nicht mehr gibt, und eine Umschichtung kann kein Kandidat decken.
    // Derselbe Zaehler wie in der Ableitung — sonst stuende ein Nenner da, den niemand
    // erreicht.
    belege: belegspuren(spuren, beleglage).length,
    kandidaten: merkmaleAbleiten(spuren, beleglage),
  };
}
