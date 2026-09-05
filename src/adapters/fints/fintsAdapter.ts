// FinTS-Abrufadapter — die einzige Stelle im Projekt, die `lib-fints` kennt.
//
// Leitentscheidung (ROADMAP, 2026-08-17): Wir bauen GEGEN die Bibliothek mit dem, was sie
// kann und was sie sagt. Was fehlt, wird gemeldet, nicht umgangen — und was die Bank nicht
// hergibt, erscheint als Hinweis statt als leere Liste. Daraus folgt der Stil hier: erst
// fragen (`canGet…`, `getTransactionParameters`), dann abrufen; kein Format und kein
// Kontotyp hartkodiert.
//
// Ergänzt 2026-08-20: der Zusatz „kein Patch, kein Fork, kein Vendoring" gilt so nicht
// mehr. `package.json` zeigt auf `Superheld/lib-fints#workshop` statt auf den npm-Stand
// 1.5.0. Der Grund ist kein Umgehen, sondern das Gegenteil — die vier Änderungen dort sind
// gemeldet und als Pull Requests offen:
//
//   1. Konten werden über das Konto adressiert (`AccountRef`), nicht über die Kontonummer.
//      1.5.0 nahm bei einer geteilten Nummer still das erste Konto; wir mussten die
//      weiteren sperren.
//   2. Die Kontoverbindung folgt `nationalAccountAllowed` aus den HISPAS-Parametern,
//      statt IBAN, BIC und die nationalen Felder immer zugleich zu füllen.
//   3. `HIWPDS` wird gelesen — damit ist erkennbar, welche Depot-Argumente die Bank annimmt.
//   4. Die Interaction-Klassen sind exportiert.
//
// Sobald das in einem npm-Stand ist, geht `package.json` zurück auf die Version. Der Code
// hier muss sich dafür nicht ändern.

import { FinTSClient, FinTSConfig } from "lib-fints";
import { waehrungNachCode } from "../../core";
import type { BankAccount, BankingInformation, ClientResponse, Statement } from "lib-fints";
import type { Formatvorgabe } from "../../application/fints/abrufPort";
import { formatWaehlen } from "./formatwahl";
import type {
  AbrufErgebnis,
  Abrufadapter,
  Abrufsitzung,
  Bankkonto,
  Bankprofil,
  Bankzugang,
  Depotbestand,
  Depotposition,
  Saldo,
  TanFrager,
} from "../../application/fints/abrufPort";
import { profilErheben } from "./bankprofil";
import { bankEndpunktFreigeben } from "./transport";
import {
  FINTS_QUELLE,
  bankbetragZuCent,
  depotStichtag,
  auszugsProben,
  auszugsStaende,
  isoDatum,
  zuDepotposition,
  zuRohUmsatz,
} from "./uebersetzung";

/**
 * Datum für eine ANFRAGE bauen — als LOKALER Kalendertag.
 *
 * Hier stand bis 2026-09-04 das Gegenteil, und zwar zu Recht: `dataElements/Dat.js`
 * kodierte ausgehende Daten per `toISOString()`, also in UTC. Ein `new Date(2026, 7, 18)`
 * war in Mitteleuropa `2026-08-17T22:00Z` und ging als **17.08.** an die Bank — deshalb
 * wurden sie über `Date.UTC` gebaut.
 *
 * Der Fork liest dort jetzt `getFullYear()`/`getMonth()`/`getDate()`, also lokal. Damit
 * ist die alte Kompensation die falsche Richtung. Sie fiele hier nicht auf — östlich von
 * Greenwich ergibt `Date.UTC(2026,7,18)` lokal denselben Kalendertag —, westlich davon
 * schickte sie den Vortag. Ein Fehler, der von der Zeitzone abhängt, ist genau der, den
 * man nicht findet.
 *
 * **12 Uhr und nicht Mitternacht**, aus demselben Grund, aus dem die Bibliothek es tut:
 * ein Zeitpunkt in der Tagesmitte übersteht jede Sommerzeitumstellung, auch die, die
 * anderswo um Mitternacht stattfindet.
 */
function anfrageDatum(iso: string): Date {
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(j, m - 1, t, 12);
}

function schluesselVon(k: { accountNumber: string; subAccountId?: string }): string {
  return `${k.accountNumber}|${k.subAccountId ?? ""}`;
}

function hinweiseAus(antwort: ClientResponse): string[] {
  return antwort.bankAnswers.map((a) => `${a.code} ${a.text}`);
}

const warte = (sekunden: number) => new Promise((r) => setTimeout(r, sekunden * 1000));

/**
 * `TanMediaRequirement.Required` aus `codes.ts` der Bibliothek. Als Konstante hier, weil
 * `lib-fints` das Enum in seinem `index.ts` NICHT re-exportiert — obwohl das eigene README
 * genau diesen Vergleich vorführt. Kandidat für eine Meldung nach upstream; ein Patch
 * wäre es nicht wert.
 */
const TAN_MEDIUM_PFLICHT = 2;

/**
 * Setzt eine Antwort fort, wenn die Bank eine Freigabe verlangt.
 *
 * Beim LESEN ist das die Ausnahme, nicht der Normalfall: manche Institute antworten mit
 * `3076 Starke Kundenauthentifizierung nicht notwendig` (PSD2-Ausnahme für
 * Kontoinformation). Die Ausnahme deckt aber nur 90 Tage und verfällt — ein Erstimport
 * über Monate zieht sehr wohl eine TAN. Der Pfad muss also da sein, auch wenn er selten
 * läuft.
 */
async function mitTan<T extends ClientResponse>(
  antwort: T,
  weiter: (tanReferenz: string, tan?: string) => Promise<T>,
  frageTan: TanFrager,
  decoupled?: { maxStatusRequests: number; waitingSecondsBeforeFirstStatusRequest: number; waitingSecondsBetweenStatusRequests: number },
): Promise<T> {
  if (!antwort.requiresTan || !antwort.tanReference) return antwort;

  const bild = antwort.tanPhoto ? { mimeType: antwort.tanPhoto.mimeType, daten: antwort.tanPhoto.image } : undefined;

  if (decoupled) {
    // Freigabe geschieht in der Banking-App; es wird nichts eingetippt. Die Wartezeiten
    // gibt die Bank selbst vor — nicht raten.
    //
    // Der Hinweis wird ZURUeCKGEZOGEN, sobald diese Schleife endet — egal ob die Bank
    // zugestimmt hat, die Geduld abgelaufen ist oder etwas geworfen hat. Nur hier ist
    // bekannt, dass die Frage beantwortet ist; die Anzeige kann es nicht wissen, und ein
    // stehengebliebener „bitte in der App bestätigen"-Kasten sieht nach einem Hänger aus,
    // obwohl der Abruf längst weiterläuft.
    const rueckzug = new AbortController();
    void frageTan({ text: antwort.tanChallenge, bild, decoupled: true }, rueckzug.signal);
    try {
      await warte(decoupled.waitingSecondsBeforeFirstStatusRequest || 5);
      for (let i = 0; i < (decoupled.maxStatusRequests || 20); i++) {
        const stand = await weiter(antwort.tanReference, undefined);
        if (!stand.requiresTan) return stand;
        await warte(decoupled.waitingSecondsBetweenStatusRequests || 5);
      }
      throw new Error("Die Freigabe in der Banking-App kam nicht rechtzeitig.");
    } finally {
      rueckzug.abort();
    }
  }

  const tan = await frageTan({ text: antwort.tanChallenge, bild, decoupled: false });
  if (!tan) throw new Error("Abgebrochen: keine TAN eingegeben.");
  return weiter(antwort.tanReference, tan);
}

/**
 * Kontenliste der Bank → `Bankkonto`, inklusive der Fähigkeiten, die die Bank je Konto
 * meldet.
 *
 * Bis zum Umstieg auf den Fork stand hier zusätzlich eine Kollisionsprüfung: die
 * Bibliothek adressierte Konten allein über die Kontonummer, und `getBankAccount` nahm
 * bei einer geteilten Nummer per `find` das erste Konto — ein Abruf für das zweite
 * beantwortete still die Frage für das erste. Wir mussten solche Konten sperren.
 *
 * Der Fork adressiert über das Konto selbst (`AccountRef`), also über Nummer UND
 * Unterkontomerkmal. Damit ist jedes gemeldete Konto erreichbar, und die Sperre ist
 * ersatzlos entfallen.
 */
/**
 * Der Ausschnitt des Clients, den die Aufbereitung braucht — die drei Fähigkeitsfragen.
 *
 * Ein eigener Typ, damit ein Test sie beantworten (und werfen lassen) kann, ohne einen
 * ganzen `FinTSClient` zu bauen. Genau daran hängt die Zusicherung unten: dass ein Wurf
 * bei einer Frage die beiden anderen nicht mitnimmt.
 */
export interface FintsFaehigkeiten {
  canGetAccountBalance(konto: BankAccount): boolean;
  canGetAccountStatements(konto: BankAccount): boolean;
  canGetPortfolio(konto: BankAccount): boolean;
}

/**
 * Eine Fähigkeitsfrage stellen und einen Wurf FESTHALTEN, statt ihn zu „kann nicht" zu
 * machen.
 *
 * Werfen kann sie: die Bibliothek löst das Konto gegen die frische Kontenliste auf, und
 * einen Schlüssel, den die Bank nicht mehr meldet, quittiert sie mit einer Ausnahme —
 * das ist die richtige Auskunft, aber eben eine ANDERE als „diese Fähigkeit fehlt".
 */
function fragen(was: string, frage: () => boolean, fehler: string[]): boolean {
  try {
    return frage();
  } catch (e) {
    fehler.push(`${was}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** Der Klartext am Konto — siehe die Begründung an der Aufrufstelle. */
function hinweisZu(
  bezeichnung: string,
  fehler: readonly string[],
  kannSaldo: boolean,
  kannUmsaetze: boolean,
  kannDepot: boolean,
): string | undefined {
  if (fehler.length > 0) {
    return `Für „${bezeichnung}" liess sich nicht klären, was die Bank freigibt: ${fehler.join(" · ")}`;
  }
  if (!kannUmsaetze && !kannSaldo && !kannDepot) {
    return `Die Bank gibt für „${bezeichnung}" nichts frei — weder Saldo noch Umsätze noch Bestände.`;
  }
  return undefined;
}

export function kontenAufbereiten(client: FintsFaehigkeiten, roh: readonly BankAccount[]): Bankkonto[] {
  return roh.map((k) => {
    // Mit dem Konto fragen, nicht mit seiner Nummer: eine geteilte Nummer lässt
    // `getBankAccount` jetzt werfen, statt zu raten — und die Antwort auf „kann dieses
    // Konto Umsätze" wäre sonst die des Nachbarkontos.
    //
    // JEDE FRAGE FÜR SICH, und das ist keine Formsache. Bis 2026-09-05 standen alle drei
    // in EINEM `try`: warf die erste, blieben die beiden anderen auf `false`, ohne je
    // gestellt worden zu sein. Aus einem Wurf beim Saldo wurde damit lautlos „dieses
    // Konto kann kein Depot" — und ohne `kannSaldo` fragt der Abruf keinen Saldo ab,
    // ohne Saldo entsteht kein Kontostands-Anker, und das Konto steht auf null. Ein
    // Fehler an einer Stelle wurde so zu einer falschen AUSSAGE über zwei andere.
    const fehler: string[] = [];
    const kannSaldo = fragen("Saldo", () => client.canGetAccountBalance(k), fehler);
    const kannUmsaetze = fragen("Umsätze", () => client.canGetAccountStatements(k), fehler);
    const kannDepot = fragen("Bestände", () => client.canGetPortfolio(k), fehler);
    return {
      nummer: k.accountNumber,
      unterkonto: k.subAccountId,
      schluessel: schluesselVon(k),
      iban: k.iban,
      // `accountType` war bei allen Konten `Miscellaneous` — die brauchbare Bezeichnung
      // steht in `product`. Fehlt auch die, bleibt die IBAN.
      bezeichnung: k.product?.trim() || k.iban || k.accountNumber,
      waehrung: k.currency,
      inhaber: [k.holder1, k.holder2].filter(Boolean).join(", ") || undefined,
      kannSaldo,
      kannUmsaetze,
      kannDepot,
      // ZWEI VERSCHIEDENE AUSSAGEN, und sie auseinanderzuhalten ist der ganze Zweck des
      // Hinweises: „die Bank gibt nichts frei" ist eine Auskunft der Bank, „wir konnten
      // nicht fragen" ist ein Befund über uns. Beide sahen bis 2026-09-05 gleich aus —
      // als stillschweigendes `false`, und wer daraufhin die Bank verdächtigte, suchte
      // an der falschen Stelle.
      hinweis: hinweisZu(k.product?.trim() || k.accountNumber, fehler, kannSaldo, kannUmsaetze, kannDepot),
    };
  });
}

/**
 * Der Gesamtwert eines Depots.
 *
 * Die Summe der Bank gewinnt. Fehlt sie, wird sie aus den Positionen gebildet — aber nur,
 * wenn ALLE einen Wert tragen: eine Teilsumme sähe aus wie ein Depotwert und wäre einer,
 * der zu klein ist, ohne dass man es ihm ansieht.
 */
function gesamtwert(
  gemeldet: number | undefined,
  positionen: readonly Depotposition[],
  waehrung: string | undefined,
): number | undefined {
  if (gemeldet != null) return bankbetragZuCent(gemeldet, waehrungNachCode(waehrung ?? "EUR"));
  if (positionen.length === 0 || positionen.some((p) => p.wert == null)) return undefined;
  return positionen.reduce((summe, p) => summe + (p.wert ?? 0), 0);
}

export interface FintsAdapterOptionen {
  /** DK-Produktregistrierungsnummer, exakt 25 Zeichen. */
  readonly produktId: string;
  /** Produktversion — die Bank erlaubt MAXIMAL 5 Zeichen. */
  readonly produktVersion: string;
}

class FintsSitzung implements Abrufsitzung {
  constructor(
    private readonly client: FinTSClient,
    readonly konten: readonly Bankkonto[],
    /**
     * Der Weg vom `Bankkonto` dieser App zurück zum `BankAccount` der Bibliothek.
     *
     * Nötig, weil der Port `lib-fints` nicht kennen darf — und die Bibliothek seit dem
     * Fork das Konto selbst verlangt statt seiner Nummer. Der Schlüssel ist derselbe,
     * den auch die Zuordnung persistiert: Nummer UND Unterkontomerkmal.
     */
    private readonly bankkonten: ReadonlyMap<string, BankAccount>,
    readonly hinweise: readonly string[],
    readonly bankNachrichten: readonly string[],
    readonly tanVerfahren: string | undefined,
    readonly profil: Bankprofil,
    private readonly frageTan: TanFrager,
  ) {}

  bankparameter(): string {
    // Nach JEDER Antwort neu holen: BPD/UPD werden bei jedem Auftrag mitgeschickt, und die
    // Bank schiebt geänderte Fassungen unaufgefordert nach (`bankingInformationUpdated`).
    return JSON.stringify(this.client.config.bankingInformation);
  }

  /**
   * Das Konto, wie die Bibliothek es braucht.
   *
   * Wirft statt zu raten: ein Schlüssel, den die frische UPD nicht mehr kennt, bedeutet,
   * dass die Bank das Konto nicht mehr meldet — und ein Abruf gegen ein geratenes Konto
   * liefert eine Antwort, die zu nichts gehört.
   */
  private bankkonto(konto: Bankkonto): BankAccount {
    const treffer = this.bankkonten.get(konto.schluessel);
    if (!treffer) {
      throw new Error(
        `Die Bank meldet das Konto „${konto.bezeichnung}" in dieser Sitzung nicht mehr.`,
      );
    }
    return treffer;
  }

  private get decoupled() {
    const v = this.client.config.selectedTanMethod;
    return v?.isDecoupled ? v.decoupled : undefined;
  }

  async saldo(konto: Bankkonto): Promise<Saldo | null> {
    if (!konto.kannSaldo) return null;
    let antwort = await this.client.getAccountBalance(this.bankkonto(konto));
    antwort = await mitTan(antwort, (r, t) => this.client.getAccountBalanceWithTan(r, t), this.frageTan, this.decoupled);
    if (!antwort.balance) return null;
    return {
      betrag: bankbetragZuCent(antwort.balance.balance, waehrungNachCode(antwort.balance.currency)),
      datum: isoDatum(antwort.balance.date),
      waehrung: antwort.balance.currency,
    };
  }

  /**
   * Die Depotaufstellung.
   *
   * Was mitgeschickt werden darf, sagt die Bank in `HIWPDS` — und bis zum Umstieg auf den
   * Fork konnte das niemand lesen: die drei optionalen Argumente von `getPortfolio` wurden
   * auf gut Glück gesendet oder gar nicht. Jetzt wird gefragt.
   *
   * Die Kursqualität ist der einzige Parameter, den ein Aufrufer wählt; Währung und
   * Anzahl bleiben ungesetzt, weil wir alles in der Währung der Bank und vollständig
   * wollen.
   */
  async depot(konto: Bankkonto, echtzeitkurse = false): Promise<Depotbestand | null> {
    if (!konto.kannDepot) return null;

    const wpd = this.profil.vorfaelle.find((v) => v.segment === "HKWPD");
    const kursqualitaet = echtzeitkurse && wpd?.kursqualitaetWaehlbar ? ("1" as const) : undefined;

    let antwort = await this.client.getPortfolio(this.bankkonto(konto), undefined, kursqualitaet);
    antwort = await mitTan(antwort, (r, t) => this.client.getPortfolioWithTan(r, t), this.frageTan, this.decoupled);

    const hinweise = hinweiseAus(antwort);
    if (!antwort.success) {
      throw new Error(`Die Bank hat die Depotaufstellung abgelehnt: ${hinweise.join(" · ") || "ohne Begründung"}`);
    }

    const aufstellung = antwort.portfolioStatement;
    if (!aufstellung) {
      // Die Bibliothek hebt die Rohnachricht auf, wenn ihr MT535-Parser nicht durchkommt.
      // Das ist ein Befund und keine leere Antwort — als leere Liste zurückgegeben wäre es
      // ununterscheidbar von einem Depot ohne Bestände.
      throw new Error(
        antwort.rawMT535Data
          ? "Die Bank hat eine Depotaufstellung geliefert, die die Bibliothek nicht lesen konnte."
          : `Die Bank hat keine Depotaufstellung geliefert: ${hinweise.join(" · ") || "ohne Begründung"}`,
      );
    }

    const waehrung = aufstellung.currency ?? konto.waehrung;
    const daten: (Date | undefined)[] = [];
    const positionen: Depotposition[] = [];
    for (const h of aufstellung.holdings ?? []) {
      daten.push(h.date);
      positionen.push(zuDepotposition(h, waehrung));
    }

    return {
      stichtag: depotStichtag(daten, isoDatum(new Date())),
      gesamtwert: gesamtwert(aufstellung.totalValue, positionen, waehrung),
      waehrung,
      positionen,
      hinweise,
    };
  }

  async umsaetze(
    konto: Bankkonto,
    vonIso: string,
    bisIso: string,
    format?: Formatvorgabe,
  ): Promise<AbrufErgebnis> {
    if (!konto.kannUmsaetze) throw new Error("Die Bank gibt für dieses Konto keine Umsätze frei.");

    const von = anfrageDatum(vonIso);
    const bis = anfrageDatum(bisIso);
    const hinweise: string[] = [];

    // Kein Format hartkodieren: beide Wege werden probiert, die Reihenfolge entscheidet
    // nur, welcher zuerst dran ist.
    //
    // EIN Abruf, kein Ausprobieren mehr.
    //
    // Bis 2026-09-04 wurde CAMT versucht und bei leerem Ergebnis MT940 nachgeschoben.
    // Das war ein Umweg um zwei Fehler der Bibliothek, die der Fork behoben hat: die
    // internationale Kontoverbindung mit doppelt belegten Feldern (`3010 Kontonummer ist
    // ungültig` bei leerer Liste), und ein Parsefehler, der als „success, keine Umsätze"
    // zurückkam. Seit `getAccountStatements` in diesem Fall WIRFT, ist ein leeres
    // Ergebnis wieder das, was es sein sollte — kein Umsatz im Zeitraum —, und ein
    // zweiter Versuch darauf hätte nichts mehr zu finden.
    //
    // An seine Stelle tritt eine Auskunft, und zwar die der Bibliothek selbst: welche
    // Formate DIESES KONTO anbietet. Die vergebliche erste Runde bei einem Konto ohne
    // CAMT entfällt damit ganz, statt bei jedem Abruf einmal zu laufen.
    //
    // JE KONTO und nicht je Bank, und das ist keine Feinheit: eine Bank kann CAMT
    // beherrschen und es nur für einen Teil ihrer Konten freigeben. Bis 2026-09-05 fiel
    // `getAccountStatements` in diesem Fall still auf MT940 zurück, während wir „CAMT"
    // an den Lauf schrieben — und `umsatzart` und `buchungsschluessel` sind allein über
    // dieses Etikett deutbar. Die Begründung steht ausführlich bei `formatWaehlen`.
    const bankkonto = this.bankkonto(konto);
    const gelaufen = formatWaehlen(
      format,
      this.client.getSupportedStatementFormats(bankkonto),
      konto.bezeichnung,
    );

    let antwort;
    try {
      antwort = await this.client.getAccountStatements(bankkonto, von, bis, gelaufen);
      antwort = await mitTan(antwort, (r, t) => this.client.getAccountStatementsWithTan(r, t), this.frageTan, this.decoupled);
    } catch (e) {
      // **Ein Fehler heisst „nicht abgeholt", nicht „keine Umsätze".** Der Unterschied
      // entscheidet über den fortlaufenden Abruf: `abrufAusfuehren` schreibt
      // `letzterAbrufBis` nur im Erfolgsfall fort, und deshalb MUSS das hier ein Wurf
      // bleiben. Würde daraus eine leere Liste, rückte der Zeiger weiter und der
      // ungeholte Zeitraum wäre für immer übersprungen — lautlos.
      const grund = e instanceof Error ? e.message : String(e);
      throw new Error(`${gelaufen} liess sich nicht lesen: ${grund}`);
    }
    hinweise.push(...hinweiseAus(antwort));

    if (!antwort.success) {
      throw new Error(`Die Bank hat den Abruf abgelehnt: ${hinweise.join(" · ")}`);
    }

    // `statements` ist seit dem Fork OPTIONAL — es fehlt, wenn `success` false ist oder
    // eine TAN aussteht. Beide Fälle sind oben abgefangen (Wurf bzw. `mitTan`), hier
    // bleibt nur der dritte: die Bank hat geantwortet und nichts zu melden gehabt.
    const auszuege = antwort.statements ?? [];

    const warnungen: string[] = [];
    const umsaetze = [];
    for (const buchung of alleBuchungen(auszuege)) {
      try {
        umsaetze.push(
          zuRohUmsatz(buchung, { iban: konto.iban, name: konto.bezeichnung, waehrung: konto.waehrung }),
        );
      } catch (e) {
        // Eine kaputte Zeile kippt nicht den ganzen Abruf — sie wird benannt (dieselbe
        // Regel wie beim Dateiimport).
        warnungen.push(`Buchung übersprungen: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Die Summenprobe: stimmen die Buchungen mit dem, was die Salden des Auszugs
    // behaupten? Sie steht hier und nicht in der Anwendungsschicht, weil sie die
    // Auszugsstruktur der Bank braucht — die endet an dieser Naht. Was danach kommt, sind
    // einzelne Umsätze ohne Auszug drumherum, und dort ist die Frage nicht mehr stellbar.
    //
    // Ein Befund KIPPT den Abruf nicht. Die Buchungen sind trotzdem das Wertvollere, und
    // was die Probe meldet, ist „hier stimmt etwas nicht" und nicht „welche Zeile" — den
    // Abruf daran scheitern zu lassen nähme dem Nutzer die Daten UND die Möglichkeit,
    // selbst nachzusehen.
    for (const p of auszugsProben(auszuege)) {
      warnungen.push(
        `Auszug zum ${p.datum}: die Bank meldet eine Veränderung, die ${p.buchungen} gelieferte ` +
          `Buchungen nicht ergeben (Lücke ${p.luecke} in Minor Units). Eine Zeile fehlt, ist doppelt ` +
          `oder hat das falsche Vorzeichen.`,
      );
    }

    return {
      ergebnis: { quelle: FINTS_QUELLE, umsaetze, warnungen },
      // Was am Lauf steht, sagt die ANTWORT und nicht unsere Anforderung: gesetzt hat es
      // die Interaktion, die tatsächlich geparst hat. Seit f943818 fällt die Bibliothek
      // nicht mehr still auf ein anderes Format zurück, beide wären heute also gleich —
      // aber genau diese Gleichheit war schon einmal eine Annahme, und sie stimmte nicht.
      // Fehlt die Angabe, bleibt das Angeforderte: es gibt keinen Weg, auf dem etwas
      // anderes gelaufen sein könnte, ohne dass der Abruf vorher geworfen hätte.
      format: antwort.format ?? gelaufen,
      hinweise,
      auszugsSalden: auszugsStaende(auszuege, warnungen),
    };
  }
}

function alleBuchungen(statements: readonly Statement[]) {
  return statements.flatMap((s) => s.transactions);
}


export function fintsAdapter(opt: FintsAdapterOptionen): Abrufadapter {
  return {
    id: FINTS_QUELLE,
    name: "FinTS (Direktabruf)",

    async anmelden(zugang: Bankzugang, pin: string, frageTan: TanFrager): Promise<Abrufsitzung> {
      if (!opt.produktId) {
        throw new Error(
          "Es ist keine FinTS-Produktregistrierungsnummer hinterlegt (VITE_FINTS_PRODUKT_ID). " +
            "Ohne eigene Nummer wird nichts an die Bank gesendet — sie ist kostenlos unter " +
            "fints.org zu beantragen.",
        );
      }
      // Die Bank erlaubt für die Produktversion maximal 5 Zeichen; „0.13.0" würde beim
      // ersten Senden zurückgewiesen.
      const version = opt.produktVersion.slice(0, 5);

      bankEndpunktFreigeben(zugang.url);

      const gespeichert = zugang.bankparameter
        ? (JSON.parse(zugang.bankparameter) as BankingInformation)
        : undefined;

      const config = gespeichert
        ? FinTSConfig.fromBankingInformation(
            opt.produktId,
            version,
            gespeichert,
            zugang.benutzer,
            pin,
            zugang.tanVerfahrenId,
            zugang.tanMedium,
            zugang.kundenId,
          )
        : FinTSConfig.forFirstTimeUse(
            opt.produktId,
            version,
            zugang.url,
            zugang.blz,
            zugang.benutzer,
            pin,
            zugang.kundenId,
          );

      const client = new FinTSClient(config);
      const hinweise: string[] = [];

      // ERSTER Lauf: liefert die Bankparameter (BPD) und damit erst die Liste der
      // verfügbaren TAN-Verfahren. Die Kontenliste (UPD) bleibt hier meist leer — das ist
      // kein Fehler, sondern das Henne-Ei des Protokolls: ein Dialog muss ein TAN-Verfahren
      // nennen, aber welche es gibt, sagt erst die Antwort.
      let antwort = await client.synchronize();
      hinweise.push(...hinweiseAus(antwort));

      const verfahren = config.availableTanMethods;
      if (verfahren.length === 0) throw new Error("Die Bank hat kein TAN-Verfahren gemeldet.");
      const gewuenscht = verfahren.find((v) => v.id === zugang.tanVerfahrenId) ?? verfahren[0];
      const gewaehlt = client.selectTanMethod(gewuenscht.id);

      // Ob ein Medium gewählt werden MUSS, sagt die Bank — nicht die Länge der Liste.
      if (Number(gewaehlt.tanMediaRequirement) === TAN_MEDIUM_PFLICHT) {
        const medium = zugang.tanMedium ?? gewaehlt.activeTanMedia[0];
        if (!medium) throw new Error(`Das Verfahren „${gewaehlt.name}" verlangt ein TAN-Medium, die Bank nennt keines.`);
        client.selectTanMedia(medium);
      }

      // ZWEITER Lauf — jetzt kommen die Konten. Wer ihn weglässt, bekommt eine
      // erfolgreiche Antwort mit leerer Kontenliste: kein Fehler, keine Warnung.
      antwort = await client.synchronize();
      antwort = await mitTan(
        antwort,
        (r, t) => client.synchronizeWithTan(r, t),
        frageTan,
        gewaehlt.isDecoupled ? gewaehlt.decoupled : undefined,
      );
      hinweise.push(...hinweiseAus(antwort));

      if (!antwort.success) {
        throw new Error(`Anmeldung fehlgeschlagen: ${hinweise.join(" · ") || "keine Begründung von der Bank"}`);
      }

      const info = config.bankingInformation;
      const rohkonten = info.upd?.bankAccounts ?? [];
      const konten = kontenAufbereiten(client, rohkonten);
      const bankkonten = new Map(rohkonten.map((k) => [schluesselVon(k), k]));

      // Was die Bank kann, sagt sie selbst — abfragen statt annehmen. Bis hierher holten
      // wir daraus genau einen Wert (den Speicherzeitraum) und warfen den Rest weg.
      const profil = profilErheben(config, schluesselVon, isoDatum(new Date()));

      return new FintsSitzung(
        client,
        konten,
        bankkonten,
        hinweise,
        (info.bankMessages ?? []).map((m) => [m.subject, m.text].filter(Boolean).join(": ")),
        gewaehlt.name,
        profil,
        frageTan,
      );
    },
  };
}
