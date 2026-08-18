// FinTS-Abrufadapter — die einzige Stelle im Projekt, die `lib-fints` kennt.
//
// Leitentscheidung (ROADMAP, 2026-08-17): Wir bauen GEGEN die Bibliothek mit dem, was sie
// kann und was sie sagt. Kein Patch, kein Fork, kein Vendoring. Was fehlt, wird gemeldet,
// nicht umgangen — und was die Bank nicht hergibt, erscheint als Hinweis statt als leere
// Liste. Daraus folgt der Stil hier: erst fragen (`canGet…`, `getTransactionParameters`),
// dann abrufen; kein Format und kein Kontotyp hartkodiert.

import { FinTSClient, FinTSConfig } from "lib-fints";
import { waehrungNachCode } from "../../core";
import type { BankAccount, BankingInformation, ClientResponse, Statement } from "lib-fints";
import type {
  AbrufErgebnis,
  Abrufadapter,
  Abrufsitzung,
  Bankkonto,
  Bankzugang,
  Saldo,
  TanFrager,
} from "../../application/fints/abrufPort";
import { bankEndpunktFreigeben } from "./transport";
import { FINTS_QUELLE, bankbetragZuCent, isoDatum, zuRohUmsatz } from "./uebersetzung";

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
 * Beim LESEN ist das die Ausnahme, nicht der Normalfall: comdirect antwortet mit
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
    void frageTan({ text: antwort.tanChallenge, bild, decoupled: true });
    await warte(decoupled.waitingSecondsBeforeFirstStatusRequest || 5);
    for (let i = 0; i < (decoupled.maxStatusRequests || 20); i++) {
      const stand = await weiter(antwort.tanReference, undefined);
      if (!stand.requiresTan) return stand;
      await warte(decoupled.waitingSecondsBetweenStatusRequests || 5);
    }
    throw new Error("Die Freigabe in der Banking-App kam nicht rechtzeitig.");
  }

  const tan = await frageTan({ text: antwort.tanChallenge, bild, decoupled: false });
  if (!tan) throw new Error("Abgebrochen: keine TAN eingegeben.");
  return weiter(antwort.tanReference, tan);
}

/** Kontenliste der Bank → `Bankkonto`, inklusive Fähigkeiten und Kollisionsbefund. */
function kontenAufbereiten(client: FinTSClient, roh: readonly BankAccount[]): Bankkonto[] {
  const proNummer = new Map<string, number>();
  for (const k of roh) proNummer.set(k.accountNumber, (proNummer.get(k.accountNumber) ?? 0) + 1);

  return roh.map((k, i) => {
    // Die gesamte API von lib-fints adressiert Konten ALLEIN über die Nummer, und
    // `FinTSConfig.getBankAccount` nimmt per `find` das ERSTE Konto mit dieser Nummer
    // (config.js:188). Kommt eine Nummer mehrfach vor — comdirect meldet Girokonto und
    // Depot unter derselben und trennt über das Unterkontomerkmal —, dann ist das erste
    // Konto sehr wohl erreichbar: jeder Abruf landet genau dort. Unerreichbar sind die
    // WEITEREN; im Spike sichtbar am „Depot-Saldo", der der Girokonto-Saldo war.
    //
    // Deshalb nicht pauschal alle Konten einer geteilten Nummer sperren: das nähme dem
    // Nutzer sein Girokonto, also genau das Konto, um das es geht.
    const ersteMitNummer = roh.findIndex((a) => a.accountNumber === k.accountNumber);
    const geteilt = (proNummer.get(k.accountNumber) ?? 0) > 1;
    const mehrdeutig = geteilt && i !== ersteMitNummer;
    let kannSaldo = false;
    let kannUmsaetze = false;
    try {
      kannSaldo = client.canGetAccountBalance(k.accountNumber);
      kannUmsaetze = client.canGetAccountStatements(k.accountNumber);
    } catch {
      // canGet… wirft bei unbekannter Kontonummer — dann eben „kann nicht".
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
      kannSaldo: kannSaldo && !mehrdeutig,
      kannUmsaetze: kannUmsaetze && !mehrdeutig,
      adressierbar: !mehrdeutig,
      hinweis: mehrdeutig
        ? `Die Bank meldet die Kontonummer ${k.accountNumber} mehrfach und unterscheidet nur über das ` +
          `Unterkontomerkmal („${k.subAccountId ?? "—"}"). Die Bibliothek spricht Konten allein über die Nummer an ` +
          `und träfe damit „${roh[ersteMitNummer].product ?? roh[ersteMitNummer].accountNumber}" — dieses Konto ` +
          `ist deshalb nicht abrufbar.`
        : geteilt
          ? `Teilt sich die Kontonummer ${k.accountNumber} mit einem weiteren Konto der Bank. Abgerufen wird ` +
            `dieses hier, weil die Bibliothek das erste Konto mit dieser Nummer nimmt.`
          : undefined,
    };
  });
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
    readonly hinweise: readonly string[],
    readonly bankNachrichten: readonly string[],
    readonly tanVerfahren: string | undefined,
    readonly speicherzeitraumTage: number | undefined,
    private readonly frageTan: TanFrager,
  ) {}

  bankparameter(): string {
    // Nach JEDER Antwort neu holen: BPD/UPD werden bei jedem Auftrag mitgeschickt, und die
    // Bank schiebt geänderte Fassungen unaufgefordert nach (`bankingInformationUpdated`).
    return JSON.stringify(this.client.config.bankingInformation);
  }

  private get decoupled() {
    const v = this.client.config.selectedTanMethod;
    return v?.isDecoupled ? v.decoupled : undefined;
  }

  async saldo(konto: Bankkonto): Promise<Saldo | null> {
    if (!konto.kannSaldo) return null;
    let antwort = await this.client.getAccountBalance(konto.nummer);
    antwort = await mitTan(antwort, (r, t) => this.client.getAccountBalanceWithTan(r, t), this.frageTan, this.decoupled);
    if (!antwort.balance) return null;
    return {
      betrag: bankbetragZuCent(antwort.balance.balance, waehrungNachCode(antwort.balance.currency)),
      datum: isoDatum(antwort.balance.date),
      waehrung: antwort.balance.currency,
    };
  }

  async umsaetze(konto: Bankkonto, vonIso: string, bisIso: string): Promise<AbrufErgebnis> {
    if (!konto.adressierbar) throw new Error(konto.hinweis ?? "Dieses Konto ist nicht adressierbar.");
    if (!konto.kannUmsaetze) throw new Error("Die Bank gibt für dieses Konto keine Umsätze frei.");

    const von = anfrageDatum(vonIso);
    const bis = anfrageDatum(bisIso);
    const hinweise: string[] = [];

    // Kein Format hartkodieren: erst CAMT anfragen, und NUR wenn die Bank ablehnt, auf
    // MT940 zurückfallen. comdirect lehnt CAMT mit `3010 Kontonummer ist ungültig` ab
    // (Ursache: HKCAZ nutzt die internationale Kontoverbindung, in der lib-fints IBAN, BIC
    // und die nationalen Felder ZUGLEICH füllt; die Spezifikation meint das eine oder das
    // andere). Bei einer anderen Bank kann CAMT dagegen laufen — deshalb fragen wir sie,
    // statt es zu entscheiden.
    let format = "CAMT";
    let antwort = await this.client.getAccountStatements(konto.nummer, von, bis, true);
    antwort = await mitTan(antwort, (r, t) => this.client.getAccountStatementsWithTan(r, t), this.frageTan, this.decoupled);
    hinweise.push(...hinweiseAus(antwort));

    if (!antwort.success || antwort.statements.length === 0) {
      hinweise.push("CAMT lieferte nichts — Rückfall auf MT940.");
      format = "MT940";
      antwort = await this.client.getAccountStatements(konto.nummer, von, bis, false);
      antwort = await mitTan(antwort, (r, t) => this.client.getAccountStatementsWithTan(r, t), this.frageTan, this.decoupled);
      hinweise.push(...hinweiseAus(antwort));
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

    return {
      ergebnis: { quelle: FINTS_QUELLE, umsaetze, warnungen },
      format,
      hinweise,
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
      const konten = kontenAufbereiten(client, info.upd?.bankAccounts ?? []);

      // Wie weit die Bank überhaupt zurückreicht, sagt sie selbst (comdirect: 540 Tage).
      // Abfragen statt annehmen — und der Aufruf wirft für Vorfälle ohne Segmentdefinition.
      let speicherzeitraumTage: number | undefined;
      try {
        speicherzeitraumTage = config.getTransactionParameters<{ maxDays: number }>("HKKAZ")?.maxDays;
      } catch {
        speicherzeitraumTage = undefined;
      }

      return new FintsSitzung(
        client,
        konten,
        hinweise,
        (info.bankMessages ?? []).map((m) => [m.subject, m.text].filter(Boolean).join(": ")),
        gewaehlt.name,
        speicherzeitraumTage,
        frageTan,
      );
    },
  };
}
