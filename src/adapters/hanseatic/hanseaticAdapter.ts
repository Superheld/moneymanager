// Der zweite Abrufweg — dieselben Ports wie FinTS, eine andere Bank dahinter.
//
// Er erfüllt `Abrufadapter` und `Abrufsitzung` unverändert. Das war nicht selbstverständlich:
// die Ports sind an FinTS entstanden, und drei ihrer Begriffe bedeuten hier etwas anderes.
// Wo das so ist, steht es an der Stelle — nicht, damit es entschuldigt ist, sondern damit
// niemand später eine Bedeutung hineinliest, die nie da war:
//
//  • `bankparameter()` trägt bei FinTS BPD/UPD, hier das GERÄTETOKEN. Beides ist dasselbe
//    Versprechen: was hier aufbewahrt wird, spart beim nächsten Mal eine Rückfrage.
//  • `TanHerausforderung` ist hier immer `decoupled` — diese Bank kennt keine eingetippte
//    TAN, nur die Bestätigung in ihrer App.
//  • `Bankprofil.vorfaelle` bleibt LEER. Vorfälle sind FinTS-Segmente; diese Bank meldet
//    keine. Was sie kann, steht am Konto (`kannSaldo`/`kannUmsaetze`/`kannDepot`) — dort,
//    wo es auch bei FinTS steht.
//
// Die Bibliothek selbst liegt in `vendor/hanseatic-bank` und weiss von diesem Projekt
// nichts. Alles, was ihre Datenformen in unsere übersetzt, steht in `uebersetzung.ts`.

import type {
  AbrufErgebnis,
  Abrufadapter,
  Abrufsitzung,
  Bankkonto,
  Bankprofil,
  Bankzugang,
  Depotbestand,
  Saldo,
  TanFrager,
} from "../../application/fints/abrufPort";
import type { Account, Transaction, TransactionPage } from "../../vendor/hanseatic-bank/types.js";
import type { StateStore } from "../../vendor/hanseatic-bank/store.js";
import { HanseaticClient } from "../../vendor/hanseatic-bank/client.js";
import { betragZuCent, zuImportErgebnis } from "./uebersetzung";
// Der Umleiter auf den Tauri-Transport ist NICHT FinTS-spezifisch: er gibt einen Origin
// frei und haengt an `globalThis.fetch`, also traegt er jede Bibliothek, die dieses fetch
// benutzt. Dass er unter `fints/` liegt, ist historisch — dort entstand er. Ein Umzug an
// einen gemeinsamen Ort waere richtig, aber er wuerde den tragenden Bankweg anfassen; das
// ist es an dieser Stelle nicht wert. Wer ihn das naechste Mal ohnehin anfasst, nimmt ihn
// mit.
import { bankEndpunktFreigeben } from "../fints/transport";

/**
 * Die beiden Hosts, die diese Bibliothek anspricht.
 *
 * Das Gateway traegt alle Aufrufe; die Weboberflaeche wird beim Anmelden einmal gelesen,
 * weil dort der oeffentliche Client-Schluessel im Klartext steht. Beide muessen ZUSAETZLICH
 * in `src-tauri/capabilities/hanseatic.json` stehen — die Freigabe hier ist nur die Seite
 * in der Webview. Fehlt sie dort, antwortet nicht die Bank, sondern ein Berechtigungsfehler.
 */
const HOSTS = ["https://connecthb.hanseaticbank.de", "https://meine.hanseaticbank.de"];

export const HANSEATIC_ADAPTER_ID = "hanseatic";

/**
 * Was dieser Adapter von der Bibliothek braucht — und sonst nichts.
 *
 * Absichtlich schmaler als `HanseaticClient`: so lässt sich der Adapter ohne Netz prüfen,
 * und die Tests brauchen keine halbe Bank nachzubauen. Die echte Klasse erfüllt es.
 */
export interface Bankclient {
  login(creds: { loginId: string; password: string }, opts?: { onChallenge?: () => void }): Promise<void>;
  elevate(opts: { onConfirm: () => void }): Promise<void>;
  getAccounts(): Promise<Account[]>;
  getTransactions(kontoId: string, zeitraum?: { from?: Date; to?: Date }): Promise<TransactionPage>;
}

export type ClientFabrik = (config: { clientBasic: string; store: StateStore }) => Bankclient;

/**
 * Der Speicher für das Gerätetoken.
 *
 * Er liest aus dem, was am Zugang stand, und merkt sich, was die Bank zurückgibt — mehr
 * nicht. Die Bibliothek verlangt einen `StateStore`; ihn an eine Datei oder Tabelle zu
 * hängen wäre falsch, weil der Zugang seinen Zustand ohnehin schon aufbewahrt. Was hier
 * ankommt, holt sich die Anwendung über `bankparameter()` ab und speichert es dort, wo
 * sie es bei FinTS auch tut.
 */
class Tokenspeicher implements StateStore {
  #token: string | null;

  constructor(start: string | null) {
    this.#token = start;
  }

  get aktuell(): string | null {
    return this.#token;
  }

  async getDeviceToken(): Promise<string | null> {
    return this.#token;
  }

  async setDeviceToken(_loginId: string, token: string): Promise<void> {
    this.#token = token;
  }
}

/** Aus dem, was am Zugang steht, das Gerätetoken herausholen. */
function tokenAus(bankparameter?: string): string | null {
  if (!bankparameter) return null;
  try {
    const o = JSON.parse(bankparameter) as { geraetetoken?: unknown };
    return typeof o.geraetetoken === "string" && o.geraetetoken ? o.geraetetoken : null;
  } catch {
    // Unlesbares heisst „nichts gemerkt". Der nächste Anmeldeversuch klingelt dann einmal
    // im Handy und legt ein frisches Token an — ärgerlich, aber nicht kaputt.
    return null;
  }
}

/** Ein Konto der Bank → unser Bankkonto. */
export function zuBankkonto(k: Account): Bankkonto {
  return {
    nummer: k.id,
    // Diese Bank kennt kein Unterkontomerkmal; ihre Kontonummer ist für sich eindeutig.
    schluessel: k.id,
    iban: k.iban || undefined,
    bezeichnung: k.productLabel || k.id,
    waehrung: k.currency || undefined,
    inhaber: k.holder || undefined,
    kannSaldo: true,
    kannUmsaetze: true,
    // Diese Bank führt keine Depots. Kein Sonderfall, nur eine Fähigkeit, die fehlt.
    kannDepot: false,
  };
}

/**
 * Das Profil dieser Bank.
 *
 * `vorfaelle` bleibt leer, und das ist eine Aussage: Vorfälle sind FinTS-Segmente, und
 * diese Bank spricht kein FinTS. Ein erfundenes Segment hineinzuschreiben hiesse, eine
 * Fähigkeitsmeldung zu behaupten, die es nicht gibt.
 */
function profil(standAm: string): Bankprofil {
  return {
    standAm,
    tanVerfahren: [
      {
        // Diese Bank nennt ihr Verfahren nicht mit einer Nummer — es gibt nur eines.
        id: 0,
        name: "Secure-App",
        decoupled: true,
        mediumPflicht: false,
        medien: [],
      },
    ],
    vorfaelle: [],
    kontoVorfaelle: {},
  };
}

function heute(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

/** Ist das der Fehler, den die Bibliothek für „erst bestätigen" benutzt? */
function brauchtFreigabe(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "not_elevated";
}

class Sitzung implements Abrufsitzung {
  readonly konten: readonly Bankkonto[];
  readonly hinweise: readonly string[];
  readonly bankNachrichten: readonly string[] = [];
  readonly tanVerfahren = "Secure-App";
  readonly profil: Bankprofil;

  readonly #client: Bankclient;
  readonly #speicher: Tokenspeicher;
  readonly #rohkonten: readonly Account[];
  readonly #frageTan: TanFrager;

  constructor(
    client: Bankclient,
    speicher: Tokenspeicher,
    rohkonten: readonly Account[],
    frageTan: TanFrager,
    hinweise: readonly string[],
  ) {
    this.#client = client;
    this.#speicher = speicher;
    this.#rohkonten = rohkonten;
    this.#frageTan = frageTan;
    this.konten = rohkonten.map(zuBankkonto);
    this.hinweise = hinweise;
    this.profil = profil(heute());
  }

  /**
   * Bei FinTS stehen hier BPD/UPD, hier das Gerätetoken — dieselbe Aufgabe: was
   * aufbewahrt wird, spart beim nächsten Mal die Rückfrage im Handy.
   */
  bankparameter(): string {
    return JSON.stringify({ geraetetoken: this.#speicher.aktuell ?? "" });
  }

  /**
   * Der Saldo kommt aus der Kontenliste, ohne zweiten Aufruf.
   *
   * Diese Bank liefert ihn zusammen mit den Konten; ihn noch einmal zu holen gäbe
   * denselben Wert und eine Runde mehr. Das Datum ist deshalb der Abruftag und kein
   * Stichtag der Bank — sie nennt keinen.
   */
  async saldo(konto: Bankkonto): Promise<Saldo | null> {
    const k = this.#rohkonten.find((r) => r.id === konto.schluessel);
    if (!k) return null;
    return {
      betrag: betragZuCent(k.balance, k.currency || "EUR"),
      datum: heute(),
      waehrung: k.currency || "EUR",
    };
  }

  async umsaetze(konto: Bankkonto, vonIso: string, bisIso: string): Promise<AbrufErgebnis> {
    const k = this.#rohkonten.find((r) => r.id === konto.schluessel);
    const zeitraum = { from: new Date(vonIso), to: new Date(bisIso) };

    let seite: TransactionPage;
    try {
      seite = await this.#client.getTransactions(konto.schluessel, zeitraum);
    } catch (e) {
      if (!brauchtFreigabe(e)) throw e;
      // Ältere Buchungen liegen hinter einer zweiten Bestätigung. Die Bibliothek wirft
      // vorher, statt eine Teilmenge zu liefern — deshalb ist hier ein Wiederholen nach
      // der Freigabe richtig und kein Herumraten.
      await this.#freigeben();
      seite = await this.#client.getTransactions(konto.schluessel, zeitraum);
    }

    return this.#ergebnis(seite, k);
  }

  /** Diese Bank führt keine Depots. `null` heisst genau das, und ist kein Fehler. */
  async depot(): Promise<Depotbestand | null> {
    return null;
  }

  async #freigeben(): Promise<void> {
    await this.#client.elevate({
      onConfirm: () => {
        // Die Rückfrage der Bibliothek ist synchron, unsere Anzeige ist es nicht. Das
        // Warten übernimmt die Bibliothek selbst (sie fragt den Stand ab, bis bestätigt
        // ist); hier wird nur der Hinweis angestossen. Auf sein Ergebnis zu warten wäre
        // sogar falsch — es gibt nichts einzutippen, worauf man warten könnte.
        void this.#frageTan({
          decoupled: true,
          text: "Bitte in der Secure-App bestätigen, um ältere Umsätze freizugeben.",
        });
      },
    });
  }

  #ergebnis(seite: TransactionPage, konto?: Account): AbrufErgebnis {
    const ergebnis = zuImportErgebnis(seite.transactions as readonly Transaction[], konto);
    const hinweise: string[] = [];

    // „Alles, was zu haben war" ist nicht dasselbe wie „der Zeitraum ist abgedeckt".
    // Diesen Unterschied verschweigt sonst niemand mehr, sobald die Zeilen erst einmal
    // im Import stehen.
    if (!seite.reachedFrom) {
      hinweise.push(
        seite.oldestReached
          ? `Die Historie der Bank reicht nur bis ${seite.oldestReached} zurück.`
          : "Die Bank lieferte für diesen Zeitraum nichts.",
      );
    }

    return {
      ergebnis,
      // Bei FinTS steht hier „CAMT" oder „MT940". Diese Bank hat nur ein Format und
      // nennt es nicht; der Name des Wegs ist die ehrlichste Auskunft.
      format: HANSEATIC_ADAPTER_ID,
      hinweise,
      // Diese Bank liefert keine Auszugsstände — ihre Umsatzantwort trägt keine Salden.
      auszugsSalden: [],
    };
  }
}

/**
 * Baut den Adapter. Die Fabrik ist austauschbar, damit die Tests ohne Netz auskommen.
 */
export function hanseaticAdapter(
  fabrik: ClientFabrik = (c) => new HanseaticClient(c),
): Abrufadapter {
  return {
    id: HANSEATIC_ADAPTER_ID,
    name: "Hanseatic Bank", // privacy-ok — Institutsname, siehe privatsphaere.test.ts
    async anmelden(zugang: Bankzugang, pin: string, frageTan: TanFrager): Promise<Abrufsitzung> {
      if (!zugang.token) {
        throw new Error(
          "Diesem Zugang fehlt der Ausweis der Anwendung. Ohne ihn weist die Bank jede " +
            "Anmeldung ab — er wird einmalig in den Zugangsdaten hinterlegt.",
        );
      }

      // Vor dem ersten Aufruf: sonst stirbt er im CORS der Webview. Die Bank sendet
      // keinen `Access-Control-Allow-Origin`-Header, und daran scheitert jeder Abruf,
      // bevor er die Bank ueberhaupt erreicht.
      for (const host of HOSTS) bankEndpunktFreigeben(host);

      const speicher = new Tokenspeicher(tokenAus(zugang.bankparameter));
      const client = fabrik({ clientBasic: zugang.token, store: speicher });

      await client.login(
        { loginId: zugang.benutzer, password: pin },
        {
          onChallenge: () => {
            void frageTan({
              decoupled: true,
              text: "Bitte die Anmeldung in der Secure-App bestätigen.",
            });
          },
        },
      );

      const konten = await client.getAccounts();
      const hinweise = konten.length === 0 ? ["Die Bank meldete kein Konto."] : [];
      return new Sitzung(client, speicher, konten, frageTan, hinweise);
    },
  };
}
