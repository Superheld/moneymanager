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
import { paareImBestand, type Bewertung, type Umsatz } from "./import";
import type { Kontozuordnung } from "./fints/bankzugangPort";
import type {
  ImportLaufRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
} from "./ports";

/**
 * Was die Dublettenprüfung zu einer gebuchten Zeile sagt.
 *
 * Es gibt bewusst kein „Original" und keine „Kopie": beide Zeilen liegen im Ledger, und
 * welche davon weg soll, entscheidet niemand automatisch. Deshalb wird bei einem Fund
 * auch BEIDEN Zeilen der Verdacht angeschrieben.
 */
export interface Dublettenverdacht {
  readonly urteil: Bewertung["urteil"];
  readonly punkte: number;
  /** Warum — im Klartext, damit eine Fehleinschätzung nachvollziehbar bleibt. */
  readonly gruende: readonly string[];
  /** Die andere Buchung: ihre Ist-Buchungs-ID und ihr Datum. */
  readonly zwillingIstId: string;
  readonly zwillingDatum: string;
}

/** Quellen, die als Bankabruf gelten — deren Zeilen sind nicht von Hand löschbar. */
export const ABRUF_QUELLEN: ReadonlySet<string> = new Set(["fints"]);

export interface KontenDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly ledger: LedgerPort;
  readonly regelRepo: ZahlungsregelRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
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
}

export async function kontenLaden(deps: KontenDeps): Promise<Kontensicht> {
  const [konten, buchungen, regeln, kategorien, umsaetze, zuordnungen, offene, laeufe] =
    await Promise.all([
      deps.kontoRepo.alle(),
      deps.ledger.alle(),
      deps.regelRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.umsatzRepo.alle(),
      deps.kontozuordnungen(),
      deps.umsatzRepo.offene(),
      deps.laufRepo.alle(),
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
  const dublettenverdacht = verdachtJeBuchung(umsaetze, new Set(buchungen.map((b) => b.id)));

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
  };
}

/**
 * Sucht Dubletten unter den VERBUCHTEN Umsätzen, je Konto getrennt, und schreibt den
 * Befund beiden Seiten an.
 *
 * Je Konto getrennt, weil zwei gleiche Beträge auf verschiedenen Konten nie dieselbe
 * Buchung sind — und weil es die Vergleiche kleinhält. Nur verbuchte: was noch als
 * Entwurf offen liegt, steht nicht im Saldo und hat seine eigene Prüfung.
 */
function verdachtJeBuchung(
  umsaetze: readonly Umsatz[],
  gebuchteIds: ReadonlySet<string>,
): Map<string, Dublettenverdacht> {
  const jeKonto = new Map<string, Umsatz[]>();
  for (const u of umsaetze) {
    if (!u.istbuchungId || u.status !== "verbucht") continue;
    // Und die Buchung muss es WIRKLICH noch geben. Ein Umsatz kann „verbucht" heißen und
    // auf eine gelöschte Zeile zeigen — dann steht im Ledger nichts Doppeltes mehr, und
    // ein Verdacht wäre schlicht falsch. Am echten Bestand traf das 32 Zeilen: genau die
    // Dubletten, die schon von Hand entfernt worden waren, wurden weiter angemahnt.
    if (!gebuchteIds.has(u.istbuchungId)) continue;
    const liste = jeKonto.get(u.zahlungskontoId);
    if (liste) liste.push(u);
    else jeKonto.set(u.zahlungskontoId, [u]);
  }

  const raus = new Map<string, Dublettenverdacht>();
  for (const gruppe of jeKonto.values()) {
    for (const paar of paareImBestand(gruppe)) {
      // NUR über Lauf-Grenzen hinweg. Innerhalb EINES Laufs hat die Dublettenprüfung
      // beim Import schon über genau diese Menge entschieden und beide durchgelassen —
      // sie hier erneut anzuzweifeln hiesse, eine getroffene Entscheidung zu übergehen.
      //
      // Am echten Bestand ist der Unterschied nicht theoretisch: von 126 Paaren lagen 76
      // im selben Lauf, und die waren durchweg echte Mehrfachzahlungen — dreimal 25,00 €
      // „Uebertrag auf Girokonto" an einem Tag, zweimal 10,00 € beim selben Anbieter,
      // oder zwei [anonymisiert]-Zahlungen, die sich erst in der Referenznummer unterscheiden
      // (der Finder vergleicht den Zweck-ANFANG und sieht den Unterschied nicht).
      //
      // Was übrig bleibt, ist genau der Fall, für den die Markierung gedacht ist: dieselbe
      // Zahlung aus zwei Quellen oder aus zwei überlappenden Abrufen.
      if (paar.a.laufId === paar.b.laufId) continue;
      // Der stärkste Fund je Buchung gewinnt — `paareImBestand` liefert absteigend.
      merke(raus, paar.a.istbuchungId!, paar.b, paar.bewertung);
      merke(raus, paar.b.istbuchungId!, paar.a, paar.bewertung);
    }
  }
  return raus;
}

function merke(
  ziel: Map<string, Dublettenverdacht>,
  istId: string,
  zwilling: Umsatz,
  bewertung: Bewertung,
): void {
  if (ziel.has(istId)) return;
  ziel.set(istId, {
    urteil: bewertung.urteil,
    punkte: bewertung.punkte,
    gruende: bewertung.gruende,
    zwillingIstId: zwilling.istbuchungId!,
    zwillingDatum: zwilling.buchungstag,
  });
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
