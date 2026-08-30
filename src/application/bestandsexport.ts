// Bestand exportieren — was in diesem Haushalt passiert ist, in einer lesbaren Datei.
//
// **Das ist der GEGENPOL zum Konfigurationsexport, und die beiden dürfen nie eine Datei
// werden.** `konfiguration.ts` exportiert, wie der Haushalt ORDNET: Kategorien, später
// Budgets und Regeln. Diese Datei hier exportiert, was in ihm GESCHEHEN ist — mit IBANs,
// Salden, Empfängern und jedem Verwendungszweck. Die eine darf man weitergeben, die
// andere ist der Kontoauszug selbst. Deshalb steht sie in einer eigenen Datei, unter
// einem eigenen Namen, hinter einem eigenen Knopf mit eigener Warnung: die Trennung ist
// die einzige Zusicherung, die eine Exportdatei überhaupt tragen kann, und sie wirkt nur,
// solange man den beiden von aussen ansieht, welche man vor sich hat.
//
// **Wofür er gebaut ist.** Den Bestand einmal herausholen, um ihn anzusehen, aufzuräumen
// und pseudonymisiert als Vorlage weiterzuverwenden — für den Spielstand
// (`testwerkzeug/seedDaten.ts`) und für das mitgelieferte Kategorisierungsmodell. Beide
// Wege enden im ÖFFENTLICHEN Repo, und das ist der Punkt, an dem diese Datei gefährlich
// wird: sie ist der kürzeste Weg von der echten Datenbank dorthin. Was hier herausfällt,
// ist Rohmaterial und niemals Zwischenstand — die Pseudonymisierung passiert danach und
// ausserhalb, und kein Wächter im Repo würde einen Empfängernamen erkennen, der es doch
// hineinschafft (siehe `src/CLAUDE.md`, „Was der Wächter kann — und was nicht").
//
// **Warum vollständig und nicht sparsam.** Bei einem Export, dessen Zweck Analyse ist,
// kostet ein weggelassenes Feld einen ganzen Zyklus: man sieht erst beim Auswerten, dass
// es fehlt, und muss neu exportieren. Deshalb kommt jedes Feld mit, das eine AUSSAGE über
// die Zahlung trägt — auch `zweckCode` und `endempfaenger`, die nur CAMT liefert und die
// für die Kategorisierung wertvoller sind als der halbe Verwendungszweck. Draussen bleibt
// nur, was rein technischer Schlüssel ist (`rohHash`, `nativeId`): der Beleg steht hier
// neben seiner Buchung, der Weg zurück zu ihm wird also nicht gebraucht.
//
// **Der Beleg steht AM Buchungssatz, nicht in einem eigenen Abschnitt.** Für beide Zwecke
// ist genau die Verbindung das Interessante: der Text der Bankzeile und die Kategorie, die
// jemand ihr gegeben hat. Zwei Listen mit einer ID dazwischen zwängen jeden Leser, den
// Join selbst zu bauen, den `application/zahlungsspuren` längst kennt.
//
// **Was NICHT drin ist**, damit niemand danach sucht: unverbuchte Zeilen (Inbox,
// verworfen) — exportiert werden Buchungen, und eine Inbox-Zeile ist noch keine. Ebenso
// Budgets, Inventar, Depots, Kontogruppen und das Journal: sie hängen nicht an einer
// Buchung, und keiner der beiden Zwecke braucht sie heute.

import type { Aufteilung, IstBuchung, Person, Vertrag, Zahlungskonto } from "../core";
import { exportDateiname, type ExportZiel } from "./export";
import { belegZuBuchung } from "./buchung/belegZuBuchung";
import type { Umsatz } from "./import/umsatz";
import type {
  LedgerPort,
  PersonRepository,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
} from "./ports";

/**
 * Die Fassung DIESER Form — eigen, nicht die des Konfigurationsexports.
 *
 * Zwei Dateien, die sich unabhängig entwickeln, teilen keine Versionsnummer: sonst steigt
 * die eine, weil sich an der anderen etwas geändert hat, und `fassung` sagt nichts mehr.
 */
export const BESTANDSEXPORT_FASSUNG = 1;

/** Ein Konto, wie es in der Datei steht. Mit IBAN und Saldo — daher die Warnung oben. */
export interface ExportKonto {
  readonly id: string;
  readonly bezeichnung: string;
  readonly typ: string;
  readonly klasse: string;
  readonly iban: string | null;
  readonly inhaberIds: readonly string[];
  /** Anfangsbestand in Cent, vorzeichenbehaftet (siehe `core/konten/konto`). */
  readonly saldo: number;
}

/** Eine Person — sie steht hier, weil `ExportKonto.inhaberIds` auf sie zeigt. */
export interface ExportPerson {
  readonly id: string;
  readonly name: string;
  readonly rolle: string | null;
}

/**
 * Ein Vertrag — er steht hier, weil eine Buchung ihm zugeordnet sein kann.
 *
 * Ohne Konditionen (Laufzeit, Kündigungsfrist): die beschreiben, was VEREINBART ist, und
 * gehören damit zur Ordnung, nicht zum Geschehenen. Was eine Buchung braucht, um deutbar
 * zu sein, ist der Name dahinter — und die Kategorie, die der Vertrag seinen Zahlungen
 * vererbt.
 */
export interface ExportVertrag {
  readonly id: string;
  readonly anbieter: string;
  readonly kategorieId: string | null;
  readonly status: string;
}

/** Der Beleg zu einer Buchung, soweit es einen gibt. Rein aus `umsatz_roh`. */
export interface ExportBeleg {
  readonly gegenpartei: string;
  readonly verwendungszweck: string;
  readonly glaeubigerId: string | null;
  readonly gegenparteiIban: string | null;
  readonly mandatsreferenz: string | null;
  readonly endempfaenger: string | null;
  /** SEPA-Verwendungszweckcode (`SALA`, `RENT` …) — nur CAMT, sonst leer. */
  readonly zweckCode: string | null;
  /** Etikett bzw. Freitext je nach Format — deutbar nur über `laufId`, siehe CLAUDE.md. */
  readonly umsatzart: string | null;
  readonly buchungsschluessel: string | null;
  readonly waehrung: string;
  readonly valuta: string | null;
  /** Aus welchem Abruf die Zeile kam. Trägt das Format und damit die Deutung der zwei Felder darüber. */
  readonly laufId: string;
}

/** Eine Buchung mit allem, was an ihr hängt. */
export interface ExportBuchung {
  readonly id: string;
  readonly datum: string;
  /** Cent, vorzeichenbehaftet (negativ = Abfluss). */
  readonly betrag: number;
  readonly kontoId: string;
  readonly kategorieId: string | null;
  /** Fehlend zählt als `automatisch` — hier ausgeschrieben, damit die Datei ohne Regelwissen lesbar ist. */
  readonly kategorieHerkunft: string;
  readonly charakter: string;
  readonly quelle: string;
  readonly notiz: string | null;
  /** Verknüpft die beiden Beine einer Umbuchung. Beide stehen in dieser Datei. */
  readonly transferId: string | null;
  readonly gegenkontoId: string | null;
  readonly vertragId: string | null;
  /**
   * Gesetzt bei leerem `vertragId` heisst „gehört AUSDRÜCKLICH zu keinem Vertrag" — eine
   * Handentscheidung, nicht ein fehlender Wert. Siehe CLAUDE.md, „Zuordnungen stehen an
   * der Buchung".
   */
  readonly vertragHerkunft: string | null;
  /** Leer bei ungeteilter Buchung; sonst ist Σ Teile = `betrag`. */
  readonly aufteilungen: readonly Aufteilung[];
  readonly zuPruefen: boolean;
  /** `null` bei einer von Hand erfassten Buchung — die hat keinen Beleg. */
  readonly beleg: ExportBeleg | null;
}

/** Die Datei als Ganzes. */
export interface Bestandsexport {
  readonly fassung: number;
  readonly erzeugt: string;
  readonly personen: readonly ExportPerson[];
  readonly konten: readonly ExportKonto[];
  readonly vertraege: readonly ExportVertrag[];
  readonly buchungen: readonly ExportBuchung[];
}

/** Woher der Use-Case seine Zutaten holt — gebündelt, weil es sechs sind. */
export interface Bestandsquellen {
  readonly ledger: LedgerPort;
  readonly umsaetze: UmsatzRepository;
  readonly konten: ZahlungskontoRepository;
  readonly personen: PersonRepository;
  readonly vertraege: VertragRepository;
  readonly vertragszuordnungen: VertragszuordnungRepository;
}

function leer(wert: string | undefined | null): string | null {
  // Ein `undefined` verschwindet beim Serialisieren, und ein fehlendes Feld sieht aus wie
  // eines, das jemand vergessen hat — zwei verschiedene Aussagen. Dieselbe Überlegung wie
  // bei `elternId` im Konfigurationsexport.
  return wert === undefined || wert === "" ? null : wert;
}

function belegForm(u: Umsatz): ExportBeleg {
  return {
    gegenpartei: u.gegenpartei,
    verwendungszweck: u.verwendungszweck,
    glaeubigerId: leer(u.glaeubigerId),
    gegenparteiIban: leer(u.gegenparteiIban),
    mandatsreferenz: leer(u.mandatsreferenz),
    endempfaenger: leer(u.endempfaenger),
    zweckCode: leer(u.zweckCode),
    umsatzart: leer(u.umsatzart),
    buchungsschluessel: leer(u.buchungsschluessel),
    waehrung: u.waehrung,
    valuta: leer(u.valuta),
    laufId: u.laufId,
  };
}

/**
 * Die Buchungen in Exportform — mit ihrem Beleg und ihrer Vertragszuordnung.
 *
 * **Sortiert nach Datum, bei Gleichstand nach ID.** Zwei Exporte desselben Bestands sollen
 * sich vergleichen lassen; ohne feste Reihenfolge wäre jeder Unterschied im Diff Rauschen.
 * Die ID als zweiter Schlüssel, weil an einem Tag beliebig viele Buchungen liegen und die
 * Reihenfolge der Datenbank nichts zusichert.
 *
 * Rein und ohne IO — wer die Teile schon geladen hat, ruft das hier direkt auf.
 */
export function buchungenInExportform(
  buchungen: readonly IstBuchung[],
  umsaetze: readonly Umsatz[],
  zuordnungen: ReadonlyMap<string, { vertragId: string | null; herkunft: string }>,
): ExportBuchung[] {
  const belege = belegZuBuchung(umsaetze);

  return [...buchungen]
    .sort((a, b) => (a.datum === b.datum ? a.id.localeCompare(b.id) : a.datum.localeCompare(b.datum)))
    .map((b) => {
      const beleg = belege.get(b.id);
      const zuordnung = zuordnungen.get(b.id);
      return {
        id: b.id,
        datum: b.datum,
        betrag: b.betrag,
        kontoId: b.kontoId,
        kategorieId: leer(b.kategorieId),
        kategorieHerkunft: b.kategorieHerkunft ?? "automatisch",
        charakter: b.charakter,
        quelle: b.quelle,
        notiz: leer(b.notiz),
        transferId: leer(b.transferId),
        gegenkontoId: leer(b.gegenkontoId),
        vertragId: zuordnung?.vertragId ?? null,
        vertragHerkunft: zuordnung ? zuordnung.herkunft : null,
        aufteilungen: b.aufteilungen ?? [],
        zuPruefen: b.zuPruefen === true,
        beleg: beleg ? belegForm(beleg) : null,
      };
    });
}

/** Die Konten in Exportform, nach Bezeichnung sortiert. */
export function kontenInExportform(konten: readonly Zahlungskonto[]): ExportKonto[] {
  return [...konten]
    .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de"))
    .map((k) => ({
      id: k.id,
      bezeichnung: k.bezeichnung,
      typ: k.typ,
      klasse: k.klasse,
      iban: leer(k.iban),
      inhaberIds: [...k.inhaberIds],
      saldo: k.saldo,
    }));
}

/** Die Personen in Exportform, nach Namen sortiert. */
export function personenInExportform(personen: readonly Person[]): ExportPerson[] {
  return [...personen]
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map((p) => ({ id: p.id, name: p.name, rolle: leer(p.rolle) }));
}

/** Die Verträge in Exportform, nach Anbieter sortiert. */
export function vertraegeInExportform(vertraege: readonly Vertrag[]): ExportVertrag[] {
  return [...vertraege]
    .sort((a, b) => a.anbieter.localeCompare(b.anbieter, "de"))
    .map((v) => ({
      id: v.id,
      anbieter: v.anbieter,
      kategorieId: leer(v.kategorieId),
      status: v.status,
    }));
}

/**
 * Schreibt den Bestand und meldet, wo er liegt.
 *
 * Der Zeitpunkt kommt herein und wird nicht hier geholt — dieselbe Regel wie überall: die
 * Anwendungsschicht hat keine Uhr.
 */
export async function bestandExportieren(
  quellen: Bestandsquellen,
  ziel: ExportZiel,
  erzeugt: Date,
  bestand: string,
): Promise<string> {
  const [buchungen, umsaetze, konten, personen, vertraege, zuordnungen] = await Promise.all([
    quellen.ledger.alle(),
    quellen.umsaetze.alle(),
    quellen.konten.alle(),
    quellen.personen.alle(),
    quellen.vertraege.alle(),
    quellen.vertragszuordnungen.alle(),
  ]);

  const zuordnungsIndex = new Map(
    zuordnungen.map((z) => [z.istbuchungId, { vertragId: z.vertragId, herkunft: z.herkunft }]),
  );

  const inhalt: Bestandsexport = {
    fassung: BESTANDSEXPORT_FASSUNG,
    erzeugt: erzeugt.toISOString(),
    personen: personenInExportform(personen),
    konten: kontenInExportform(konten),
    vertraege: vertraegeInExportform(vertraege),
    buchungen: buchungenInExportform(buchungen, umsaetze, zuordnungsIndex),
  };

  return ziel.schreiben(
    exportDateiname("bestand", erzeugt, bestand),
    JSON.stringify(inhalt, null, 2) + "\n",
  );
}
