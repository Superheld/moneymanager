// Konten-Sichten — die Kontoliste und das Register eines Kontos.
//
// Der Bereich ist interaktiv (welches Konto, wie viele Tage Vorschau, Suche, Filter),
// deshalb dieselbe Zweiteilung wie bei der Analyse: `kontenLaden` holt EINMAL alles,
// `registerSicht` rechnet daraus das Register des gewählten Kontos.
//
// Was hier steht und nicht im Screen, ist vor allem die Frage „darf diese Zeile gelöscht
// werden?". Sie hing bis 2026-08-19 am KONTO — alles auf einem Konto mit Bankverbindung
// war tabu, also auch das, was per Dateiimport dorthin kam. Die Bank kennt diese Zeilen
// gar nicht und holt sie nicht zurück; ohne Löschweg blieb eine falsch importierte Zeile
// für immer im Saldo. Richtig ist die HERKUNFT, und die steht am Import-Lauf — also an
// einer Stelle, die eine Tabellenspalte nicht kennen kann.

import {
  abweichungsfenster,
  anfangsbestandAusAnker,
  ankerAbweichung,
  istSummeKonto,
  juengsterAnker,
  kontoRegister,
  realerKontostand,
  type Cent,
  type IstBuchung,
  type Kategorie,
  type KontoRegister,
  type RegisterZeile,
  type Zahlungskonto,
  type Abweichungsfenster,
  type Kontostandsanker,
  type Zahlungsregel,
} from "../../core";
import { ABRUF_QUELLEN, type ImportLauf, type Umsatz } from "../import";
import {
  freigegebenePaare,
  ledgerVerdacht,
  type Dublettenverdacht,
} from "../dubletten/dublettensicht";
import type { Kontozuordnung } from "../fints/bankzugangPort";
import { depotJeKonto, depotsLaden, type Depotsicht } from "../depot/depotsichten";
import { vertragsnamenLaden } from "../vertraege/vertragszuordnung";
import type {
  DepotRepository,
  DublettenfreigabeRepository,
  ImportLaufRepository,
  KategorieRepository,
  KontostandsankerRepository,
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
} from "../ports";

// Der Verdacht selbst steht in `dublettensicht` — die Regel gilt für alle Anzeigen
// gemeinsam, nicht nur fürs Register.
export type { Dublettenverdacht };

// Welche Quelle ein Abruf ist, steht am Lauf (`import/importLauf.ts`) und wird hier nur
// weitergereicht: die Sicht wendet die Regel an, sie besitzt sie nicht.
export { ABRUF_QUELLEN };

export interface KontenDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly ledger: LedgerPort;
  readonly regelRepo: ZahlungsregelRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
  /** Die von Hand gesetzten „ist kein Duplikat"-Entscheidungen. */
  readonly freigabeRepo: DublettenfreigabeRepository;
  /** Die Kontostands-Anker — was zu einem Stichtag nachweislich auf dem Konto lag. */
  readonly ankerRepo: KontostandsankerRepository;
  /** Bankverbindungen — daran hängt der Abruf-Knopf und der Abgleich. */
  readonly kontozuordnungen: () => Promise<Kontozuordnung[]>;
  /** Für die Vertragsmarkierung im Auszug — beide zusammen ergeben den Anbieternamen. */
  readonly zuordnungRepo: VertragszuordnungRepository;
  readonly vertragRepo: VertragRepository;
  /**
   * Die Depots. Optional — ohne sie fehlt an einem Depot-Konto nur die Bestandsansicht,
   * alles andere läuft unverändert.
   */
  readonly depotRepo?: DepotRepository;
}

/** Ein Konto in der oberen Liste. */
export interface Kontozeile {
  readonly konto: Zahlungskonto;
  readonly bewegungen: Cent;
  readonly realerStand: Cent;
  /** Hängt das Konto an einer Bankverbindung? */
  readonly online: boolean;
  /**
   * Das Depot hinter diesem Konto, sofern eines daran hängt.
   *
   * Ein Depot-Konto hat keinen eigenen Saldo und keine Buchungen — sein Stand steht in der
   * Wertreihe der Bank. Ohne diese Verbindung zeigte die Kontenansicht dort eine leere
   * Liste und eine Null, während der Wert eine Tabelle weiter danebenlag.
   */
  readonly depot?: Depotsicht;
  /**
   * Der jüngste Kontostands-Anker — was zuletzt nachweislich auf dem Konto lag.
   *
   * Von der Bank gemeldet oder von Hand gezählt; `undefined` bei einem Konto, für das es
   * nie eine unabhängige Aussage gab.
   */
  readonly anker?: Kontostandsanker;
  /**
   * Anker minus App, gerechnet bis zum Stichtag des Ankers. 0 heisst beweisbar
   * vollständig; `undefined`, wenn es keinen Anker gibt. Vorzeichen mit Bedeutung:
   * + → es fehlt eine Einnahme, − → eine Ausgabe fehlt oder etwas ist doppelt drin.
   */
  readonly abweichung?: Cent;
  /**
   * Die Zeiträume zwischen zwei Ankern, in denen etwas fehlt — die eigentliche Auskunft.
   *
   * Ein einzelner Anker sagt „hier fehlen 600 Euro", diese Liste sagt „zwischen dem
   * 31.07. und dem 31.08.". Vom Anfangsbestand unabhängig, deshalb auch dann belastbar,
   * wenn der nur geschätzt ist.
   */
  readonly luecken: readonly Abweichungsfenster[];
  /**
   * Was der Anfangsbestand sein müsste, damit die Rechnung den jüngsten Anker trifft.
   *
   * Der Vorschlag für den einmaligen Abgleich; `undefined` ohne Anker oder wenn es nichts
   * zu ändern gibt.
   */
  readonly anfangsbestandVorschlag?: Cent;
}

export interface Kontensicht {
  readonly zeilen: readonly Kontozeile[];
  readonly kategorien: readonly Kategorie[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  readonly buchungen: readonly IstBuchung[];
  readonly regeln: readonly Zahlungsregel[];
  /**
   * Die Import-Läufe — geladen werden sie hier ohnehin, um `ausBankabruf` zu bestimmen.
   * Mitgegeben, weil der Dublettenvergleich zu jeder Zeile sagen können muss, WOHER sie
   * kam: dieselbe Zahlung aus Datei und Abruf ist genau der Fall, um den es dort geht.
   */
  readonly laeufe: readonly ImportLauf[];
  /**
   * IDs der Buchungen, die aus einem Bankabruf stammen — nur die sind vor dem Löschen
   * geschützt (siehe Kopf).
   */
  readonly ausBankabruf: ReadonlySet<string>;
  /** Buchungs-ID → Umsatz: Empfänger und Zweck stehen dort, nicht an der Buchung. */
  readonly umsatzZuBuchung: ReadonlyMap<string, Umsatz>;
  /**
   * Buchungs-ID → Dublettenverdacht. Steht in der Registerliste als Markierung.
   *
   * Der Abruf bucht DIREKT ins Ledger und hat seit 2026-08-20 gar keine Vorstufe mehr,
   * in der man einen Zwilling abfangen könnte — auch die Verdachtsfälle nicht. Was
   * doppelt hereinkommt (überlappendes Abruffenster, dieselbe Zahlung aus zwei Quellen),
   * stünde sonst unbemerkt zweimal im Saldo. Deshalb wird beim LESEN geprüft, nicht
   * einmalig beim Schreiben: ein Verdacht vom Importtag gälte für den Stand von damals.
   *
   * Der DATEI-Import behält seine Vorstufe (die Import-Inbox) und prüft dort vorher —
   * eine Datei ist kein Kontoauszug, sie kann alt sein oder aus einer anderen App
   * stammen. Diese Markierung hier ist der Fang danach, nicht statt dessen.
   *
   * Geprüft wird über die Umsätze, nicht über die Ist-Buchungen — Empfänger,
   * Verwendungszweck und Quellen-ID stehen dort. Eine von Hand erfasste Buchung ohne
   * Import-Kontext kann deshalb nicht geprüft werden und trägt nie eine Markierung.
   * Umgekehrt zählt ein Umsatz nur, wenn seine Ist-Buchung im Ledger auch wirklich
   * (noch) steht.
   */
  readonly dublettenverdacht: ReadonlyMap<string, Dublettenverdacht>;
  /** Die „ist kein Duplikat"-Entscheidungen als Paarschlüssel — auch die Inbox achtet darauf. */
  readonly freigegeben: ReadonlySet<string>;
  /**
   * Buchungs-ID → Anbieter des Vertrags, zu dem sie gehört.
   *
   * Im Auszug sah eine Vertragszahlung bis 2026-08-27 aus wie jede andere Ausgabe; die
   * Zuordnung stand zwar an der Buchung, aber nur der Dialog zeigte sie. Wer wissen
   * wollte, ob eine Zeile zu einem Vertrag gehört, musste sie öffnen — bei einer Liste
   * genau die Frage, die man nebenbei beantwortet haben will.
   */
  readonly vertragsnamen: ReadonlyMap<string, string>;
}

export async function kontenLaden(deps: KontenDeps): Promise<Kontensicht> {
  const [konten, buchungen, regeln, kategorien, umsaetze, zuordnungen, laeufe, freigaben, anker, depotdaten, vertragsnamen] =
    await Promise.all([
      deps.kontoRepo.alle(),
      deps.ledger.alle(),
      deps.regelRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.umsatzRepo.alle(),
      deps.kontozuordnungen(),
      deps.laufRepo.alle(),
      deps.freigabeRepo.alle(),
      deps.ankerRepo.alle(),
      deps.depotRepo ? depotsLaden({ depotRepo: deps.depotRepo }) : Promise.resolve(null),
      vertragsnamenLaden(deps.zuordnungRepo, deps.vertragRepo),
    ]);

  const abrufLaeufe = new Set(laeufe.filter((l) => ABRUF_QUELLEN.has(l.quelle)).map((l) => l.id));

  const ausBankabruf = new Set<string>();
  const umsatzZuBuchung = new Map<string, Umsatz>();
  for (const u of umsaetze) {
    if (!u.istbuchungId) continue;
    if (!umsatzZuBuchung.has(u.istbuchungId)) umsatzZuBuchung.set(u.istbuchungId, u);
    if (abrufLaeufe.has(u.laufId)) ausBankabruf.add(u.istbuchungId);
  }

  const zuordnungJeKonto = new Map(zuordnungen.map((z) => [z.zahlungskontoId, z]));
  // Die Verbindung Depot → Konto steht in derselben Zuordnung; eine eigene Spalte braucht
  // es dafür nicht.
  const depots = depotdaten ? depotJeKonto(depotdaten.depots, zuordnungen) : new Map();
  const freigegeben = freigegebenePaare(freigaben);
  const dublettenverdacht = ledgerVerdacht(umsaetze, new Set(buchungen.map((b) => b.id)), freigegeben);

  return {
    zeilen: konten.map((konto): Kontozeile => {
      const z = zuordnungJeKonto.get(konto.id);
      const juengster = juengsterAnker(anker, konto.id);
      const abweichung = juengster ? ankerAbweichung(konto, buchungen, juengster) : undefined;
      return {
        konto,
        bewegungen: istSummeKonto(buchungen, konto.id),
        realerStand: realerKontostand(konto, buchungen),
        online: !!z,
        depot: depots.get(konto.id),
        anker: juengster,
        abweichung,
        luecken: abweichungsfenster(buchungen, anker, konto.id),
        // Nur vorschlagen, wenn es etwas zu ändern gibt — sonst böte die Oberfläche eine
        // Handlung an, die nichts tut.
        anfangsbestandVorschlag:
          juengster && abweichung !== 0 ? anfangsbestandAusAnker(buchungen, juengster) : undefined,
      };
    }),
    kategorien,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    buchungen,
    regeln,
    laeufe,
    ausBankabruf,
    umsatzZuBuchung,
    dublettenverdacht,
    freigegeben,
    vertragsnamen,
  };
}

/** Eine Registerzeile mit dem, woran man sie in der Liste wiedererkennt. */
export interface Registerzeile {
  readonly zeile: RegisterZeile;
  /** Die dahinterliegende Buchung, falls die Zeile gebucht ist. */
  readonly buchung?: IstBuchung;
  /**
   * Anzeigename. Die eigene Notiz gewinnt gegen den Empfänger aus dem Import — sonst
   * wäre eine von Hand vergebene Bezeichnung („Urlaub Norwegen") in der Liste unsichtbar,
   * und die Sammelbearbeitung schriebe ins Leere. Der Name der Bank bleibt: er steht im
   * Detail unter „Herkunft" und wird hier nur überlagert.
   */
  readonly bezeichnung: string;
  readonly verwendungszweck: string;
  readonly kategorieName: string;
  /** Gesetzt, wenn dieselbe Zahlung womöglich ein zweites Mal im Konto steht. */
  readonly dublette?: Dublettenverdacht;
  /** Der Vertrag, zu dem diese Zeile gehört — als Anbietername. Fehlt, wenn keiner. */
  readonly vertragsname?: string;
}

export interface Registersicht {
  readonly gebucht: readonly Registerzeile[];
  /** Realer Stand jetzt = Anfangsbestand + Σ gebuchte Bewegungen. */
  readonly standHeute: Cent;
}

/**
 * Der Auszug EINES Kontos — nur noch das Gebuchte.
 *
 * Die geplanten Fälligkeiten standen bis 2026-08-27 mit hier drin und sind in die
 * Übersicht gewandert (`vorschauAlleKonten`). Damit ist auch der Tagesparameter weg: er
 * stellte allein ein, wie weit die Vorschau reicht, und ohne sie stellte er nichts mehr
 * ein. Ein Parameter, den niemand auswertet, ist eine Zusage, die keine ist.
 */
export function registerSicht(
  sicht: Kontensicht,
  konto: Zahlungskonto,
  heute: string,
): Registersicht {
  // Null Tage Vorschau: `kontoRegister` rechnet sie weiterhin, weil der laufende Saldo
  // und die Vorschau dieselbe Funktion sind — was hier herausfällt, ist nur, dass wir
  // sie noch weiterreichen.
  const register: KontoRegister = kontoRegister(konto, [...sicht.buchungen], [...sicht.regeln], heute, 0);
  const buchungJeId = new Map(sicht.buchungen.map((b) => [b.id, b]));
  const kategorieNamen = new Map(sicht.kategorien.map((k) => [k.id, k.name]));

  return {
    gebucht: register.gebucht.map((zeile): Registerzeile => {
      const buchung = zeile.istId ? buchungJeId.get(zeile.istId) : undefined;
      const umsatz = zeile.istId ? sicht.umsatzZuBuchung.get(zeile.istId) : undefined;
      return {
        zeile,
        buchung,
        // Die Kette der Rückfallebenen, von der eigenen Angabe zur fremden:
        //
        //   eigene Bezeichnung → Empfänger aus dem Import → VERWENDUNGSZWECK → Füllwort
        //
        // Der Verwendungszweck steht in der Kette, weil ein Teil der Bankzeilen gar keinen
        // Empfänger mitbringt: MT940 füllt das Feld je nach Institut und Geschäftsvorfall
        // nicht, und der ganze Inhalt steckt dann im Zweck-Freitext. Ohne diese Stufe
        // stünde die Zeile im Register ohne jede Beschriftung da — sichtbar leer, obwohl
        // die Angabe vorhanden ist. Am echten Bestand betrifft das eine zweistellige Zahl
        // von Zeilen, praktisch nur aus dem Abruf.
        //
        // „Buchung" ist Füllwort aus dem Register und zählt als leer.
        bezeichnung:
          buchung?.notiz ||
          umsatz?.gegenpartei ||
          umsatz?.verwendungszweck ||
          (zeile.bezeichnung && zeile.bezeichnung !== "Buchung" ? zeile.bezeichnung : ""),
        verwendungszweck: umsatz?.verwendungszweck ?? "",
        kategorieName: zeile.kategorieId ? kategorieNamen.get(zeile.kategorieId) ?? "" : "",
        dublette: zeile.istId ? sicht.dublettenverdacht.get(zeile.istId) : undefined,
        vertragsname: zeile.istId ? sicht.vertragsnamen.get(zeile.istId) : undefined,
      };
    }),
    standHeute: register.standHeute,
  };
}
