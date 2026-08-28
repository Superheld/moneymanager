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
import { formatplan } from "./formatwahl";
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
 * Datum für eine ANFRAGE bauen.
 *
 * `lib-fints` ist hier in sich uneinheitlich, und das kostet sonst einen Tag: eingehende
 * Datumsangaben parst der MT940-Parser auf LOKALE Mitternacht, ausgehende kodiert
 * `dataElements/Dat.js` per `toISOString()` — also in UTC. Ein `new Date(2026, 7, 18)`
 * wäre in Mitteleuropa `2026-08-17T22:00Z` und ginge als **17.08.** an die Bank.
 * Deshalb werden Anfragedaten über `Date.UTC` gebaut.
 */
function anfrageDatum(iso: string): Date {
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t));
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
function kontenAufbereiten(client: FinTSClient, roh: readonly BankAccount[]): Bankkonto[] {
  return roh.map((k) => {
    // Mit dem Konto fragen, nicht mit seiner Nummer: eine geteilte Nummer lässt
    // `getBankAccount` jetzt werfen, statt zu raten — und die Antwort auf „kann dieses
    // Konto Umsätze" wäre sonst die des Nachbarkontos.
    let kannSaldo = false;
    let kannUmsaetze = false;
    let kannDepot = false;
    try {
      kannSaldo = client.canGetAccountBalance(k);
      kannUmsaetze = client.canGetAccountStatements(k);
      kannDepot = client.canGetPortfolio(k);
    } catch {
      // Kennt die Bank das Konto in der UPD nicht mehr, ist die Antwort schlicht „kann nicht".
    }
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
      hinweis: !kannUmsaetze && !kannSaldo && !kannDepot
        ? `Die Bank gibt für „${k.product?.trim() || k.accountNumber}" nichts frei — weder Saldo noch Umsätze noch Bestände.`
        : undefined,
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
    // Vorgabe ist CAMT. Der häufigste Grund, warum das nichts lieferte, ist seit dem Fork
    // weg: HKCAZ nutzt die internationale Kontoverbindung, und lib-fints füllte darin
    // IBAN, BIC UND die nationalen Felder zugleich — was mindestens ein Institut mit
    // `3010 Kontonummer ist ungültig` und einer leeren Liste beantwortete. Der Fork fragt
    // stattdessen die HISPAS-Parameter der Bank (`nationalAccountAllowed`).
    //
    // Der zweite Versuch bleibt trotzdem, aus zwei Gründen: nicht jede Bank erklärt ihre
    // Ablehnung über HISPAS, und `success` taugt hier nicht als Prüfung — die Bibliothek
    // setzt es auf `höchster Rückmeldecode < 9000`, und `3010` liegt darunter. Ein leeres
    // Ergebnis ist der einzige verlässliche Indikator.
    //
    // `zuletzt` dreht die Reihenfolge um, wo MT940 zuletzt getragen hat. Das spart die
    // ergebnislose erste Runde — und weil der zweite Versuch bleibt, kommt ein Institut,
    // das CAMT nachrüstet, von selbst wieder darauf. Ein Gedächtnis, keine Festlegung.
    //
    // `wahl` dagegen IST eine Festlegung und schliesst den anderen Weg aus. Sie wird
    // gebraucht, weil das Gedächtnis genau dann nicht greift, wenn man es am nötigsten
    // hätte: liefert der erste Versuch etwas — und sei es eine von der Bank gedeckelte
    // Teilmenge —, gilt er als erfolgreich, und der zweite läuft nie.
    const { zuerstCamt, nurEines } = formatplan(format);

    const holen = async (camt: boolean) => {
      let a = await this.client.getAccountStatements(this.bankkonto(konto), von, bis, camt);
      a = await mitTan(a, (r, t) => this.client.getAccountStatementsWithTan(r, t), this.frageTan, this.decoupled);
      hinweise.push(...hinweiseAus(a));
      return a;
    };

    const name = (camt: boolean) => (camt ? "CAMT" : "MT940");

    let gelaufen = name(zuerstCamt);
    let antwort = await holen(zuerstCamt);

    if (!antwort.success || antwort.statements.length === 0) {
      const abgelehnt = antwort.bankAnswers.find((a) => a.code === 3010);
      const grund = abgelehnt
        ? `${gelaufen} wurde abgelehnt (${abgelehnt.code} ${abgelehnt.text})`
        : `${gelaufen} lieferte nichts`;
      // Bei einer Festlegung endet es hier: wer ein Format WÄHLT, will das Ergebnis
      // dieses Formats sehen — auch das leere. Ein stiller Rückfall würde die Frage
      // beantworten, die niemand gestellt hat.
      if (nurEines) {
        hinweise.push(`${grund} — kein zweiter Versuch, das Format ist festgelegt.`);
      } else {
        hinweise.push(`${grund} — zweiter Versuch mit ${name(!zuerstCamt)}.`);
        gelaufen = name(!zuerstCamt);
        antwort = await holen(!zuerstCamt);
      }
    }

    if (!antwort.success) {
      throw new Error(`Die Bank hat den Abruf abgelehnt: ${hinweise.join(" · ")}`);
    }

    const warnungen: string[] = [];
    const umsaetze = [];
    for (const buchung of alleBuchungen(antwort.statements)) {
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
    for (const p of auszugsProben(antwort.statements)) {
      warnungen.push(
        `Auszug zum ${p.datum}: die Bank meldet eine Veränderung, die ${p.buchungen} gelieferte ` +
          `Buchungen nicht ergeben (Lücke ${p.luecke} in Minor Units). Eine Zeile fehlt, ist doppelt ` +
          `oder hat das falsche Vorzeichen.`,
      );
    }

    return {
      ergebnis: { quelle: FINTS_QUELLE, umsaetze, warnungen },
      format: gelaufen,
      hinweise,
      auszugsSalden: auszugsStaende(antwort.statements, warnungen),
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
