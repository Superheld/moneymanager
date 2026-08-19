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
  bankAbweichung,
  istSummeKonto,
  kontoRegister,
  realerKontostand,
  type Cent,
  type IstBuchung,
  type Kategorie,
  type KontoRegister,
  type RegisterZeile,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../core";
import type { Umsatz } from "./import";
import {
  freigegebenePaare,
  ledgerVerdacht,
  type Dublettenverdacht,
} from "./dublettensicht";
import type { Kontozuordnung } from "./fints/bankzugangPort";
import type {
  DublettenfreigabeRepository,
  ImportLaufRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
} from "./ports";

// Der Verdacht selbst steht in `dublettensicht` — die Regel gilt für alle Anzeigen
// gemeinsam, nicht nur fürs Register.
export type { Dublettenverdacht };

/** Quellen, die als Bankabruf gelten — deren Zeilen sind nicht von Hand löschbar. */
export const ABRUF_QUELLEN: ReadonlySet<string> = new Set(["fints"]);

export interface KontenDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly ledger: LedgerPort;
  readonly regelRepo: ZahlungsregelRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
  /** Die von Hand gesetzten „ist kein Duplikat"-Entscheidungen. */
  readonly freigabeRepo: DublettenfreigabeRepository;
  /** Bankverbindungen — daran hängt der Abruf-Knopf und der Abgleich. */
  readonly kontozuordnungen: () => Promise<Kontozuordnung[]>;
}

/** Ein Konto in der oberen Liste. */
export interface Kontozeile {
  readonly konto: Zahlungskonto;
  readonly bewegungen: Cent;
  readonly realerStand: Cent;
  /** Hängt das Konto an einer Bankverbindung? */
  readonly online: boolean;
  /** Wie viele abgerufene Zeilen dieses Kontos noch eine Entscheidung brauchen. */
  readonly wartet: number;
  /** Der zuletzt von der Bank gemeldete Stand, falls es einen gibt. */
  readonly bankSaldo?: { betrag: Cent; datum?: string };
  /**
   * Bank minus App. 0 heisst beweisbar vollständig; `undefined`, wenn die Bank nichts
   * gemeldet hat. Vorzeichen mit Bedeutung: + → es fehlt eine Einnahme, − → eine
   * Ausgabe fehlt oder etwas ist doppelt drin.
   */
  readonly abweichung?: Cent;
}

export interface Kontensicht {
  readonly zeilen: readonly Kontozeile[];
  readonly kategorien: readonly Kategorie[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  readonly buchungen: readonly IstBuchung[];
  readonly regeln: readonly Zahlungsregel[];
  readonly umsaetze: readonly Umsatz[];
  /** Offene Abruf-Zeilen aller Konten — eine Umbuchung hat ihr Gegenbein woanders. */
  readonly neueAbrufe: readonly Umsatz[];
  /** Läufe, die aus einem Bankabruf stammen. */
  readonly abrufLaeufe: ReadonlySet<string>;
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
   * Seit der Abruf DIREKT ins Ledger bucht, gibt es keine Vorstufe mehr, in der man
   * einen Zwilling abfangen könnte — außer bei echtem Dublettenverdacht der Prüfung beim
   * Import. Was danach doppelt hereinkommt (zweiter Dateiimport, überlappendes
   * Abruffenster, dieselbe Zahlung aus zwei Quellen), stünde sonst unbemerkt zweimal im
   * Saldo. Deshalb wird beim LESEN geprüft, nicht einmalig beim Schreiben: ein Verdacht
   * vom Importtag gälte für den Stand von damals.
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
}

export async function kontenLaden(deps: KontenDeps): Promise<Kontensicht> {
  const [konten, buchungen, regeln, kategorien, umsaetze, zuordnungen, offene, laeufe, freigaben] =
    await Promise.all([
      deps.kontoRepo.alle(),
      deps.ledger.alle(),
      deps.regelRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.umsatzRepo.alle(),
      deps.kontozuordnungen(),
      deps.umsatzRepo.offene(),
      deps.laufRepo.alle(),
      deps.freigabeRepo.alle(),
    ]);

  const abrufLaeufe = new Set(laeufe.filter((l) => ABRUF_QUELLEN.has(l.quelle)).map((l) => l.id));
  const neueAbrufe = offene.filter((u) => abrufLaeufe.has(u.laufId));

  const ausBankabruf = new Set<string>();
  const umsatzZuBuchung = new Map<string, Umsatz>();
  for (const u of umsaetze) {
    if (!u.istbuchungId) continue;
    if (!umsatzZuBuchung.has(u.istbuchungId)) umsatzZuBuchung.set(u.istbuchungId, u);
    if (abrufLaeufe.has(u.laufId)) ausBankabruf.add(u.istbuchungId);
  }

  const zuordnungJeKonto = new Map(zuordnungen.map((z) => [z.zahlungskontoId, z]));
  const freigegeben = freigegebenePaare(freigaben);
  const dublettenverdacht = ledgerVerdacht(umsaetze, new Set(buchungen.map((b) => b.id)), freigegeben);

  return {
    zeilen: konten.map((konto): Kontozeile => {
      const z = zuordnungJeKonto.get(konto.id);
      const bankSaldo = z?.bankSaldo != null ? { betrag: z.bankSaldo, datum: z.bankSaldoDatum } : undefined;
      return {
        konto,
        bewegungen: istSummeKonto(buchungen, konto.id),
        realerStand: realerKontostand(konto, buchungen),
        online: !!z,
        wartet: neueAbrufe.filter((u) => u.zahlungskontoId === konto.id).length,
        bankSaldo,
        abweichung: bankSaldo ? bankAbweichung(konto, buchungen, bankSaldo.betrag) : undefined,
      };
    }),
    kategorien,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    buchungen,
    regeln,
    umsaetze,
    neueAbrufe,
    abrufLaeufe,
    ausBankabruf,
    umsatzZuBuchung,
    dublettenverdacht,
    freigegeben,
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
}

export interface Registersicht {
  readonly gebucht: readonly Registerzeile[];
  readonly geplant: readonly RegisterZeile[];
  /** Realer Stand jetzt = Anfangsbestand + Σ gebuchte Bewegungen. */
  readonly standHeute: Cent;
}

export function registerSicht(
  sicht: Kontensicht,
  konto: Zahlungskonto,
  heute: string,
  tage: number,
): Registersicht {
  const register: KontoRegister = kontoRegister(konto, [...sicht.buchungen], [...sicht.regeln], heute, tage);
  const buchungJeId = new Map(sicht.buchungen.map((b) => [b.id, b]));
  const kategorieNamen = new Map(sicht.kategorien.map((k) => [k.id, k.name]));

  return {
    gebucht: register.gebucht.map((zeile): Registerzeile => {
      const buchung = zeile.istId ? buchungJeId.get(zeile.istId) : undefined;
      const umsatz = zeile.istId ? sicht.umsatzZuBuchung.get(zeile.istId) : undefined;
      return {
        zeile,
        buchung,
        // „Buchung" ist Füllwort aus dem Register und zählt als leer.
        bezeichnung:
          buchung?.notiz ||
          umsatz?.gegenpartei ||
          (zeile.bezeichnung && zeile.bezeichnung !== "Buchung" ? zeile.bezeichnung : ""),
        verwendungszweck: umsatz?.verwendungszweck ?? "",
        kategorieName: zeile.kategorieId ? kategorieNamen.get(zeile.kategorieId) ?? "" : "",
        dublette: zeile.istId ? sicht.dublettenverdacht.get(zeile.istId) : undefined,
      };
    }),
    geplant: register.geplant,
    standHeute: register.standHeute,
  };
}
