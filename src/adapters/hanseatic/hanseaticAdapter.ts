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
/** Das Gateway. Exportiert, weil die Maske es beim Anlegen als Adresse einträgt. */
export const HANSEATIC_BASIS_URL = "https://connecthb.hanseaticbank.de";

const HOSTS = [HANSEATIC_BASIS_URL, "https://meine.hanseaticbank.de"];

/**
 * Zwei Header nachreichen, die im Webview fehlen.
 *
 * Die Bibliothek ist fuer Node gebaut. Dort setzt die Laufzeit von sich aus einen
 * `user-agent`; ueber den Tauri-Transport kommt keiner an. Genau daran scheiterte die
 * Anmeldung: die Bank nahm Ausweis, Grant und Zugangsdaten an und stieg erst beim
 * Einleiten der Geraetebestaetigung mit einem internen Fehler aus (`HBSCA500`) — einem
 * Code, den nicht einmal ihre eigene Weboberflaeche kennt. Derselbe Aufruf aus Node lief
 * durch, Zeichen fuer Zeichen gleich; der Unterschied lag ausserhalb dessen, was die
 * Anfrage selbst mitbringt.
 *
 * `accept-language` steht zusaetzlich im Header-Satz ihrer Weboberflaeche. Welcher der
 * beiden noetig ist, ist NICHT auseinandersortiert — dazu braeuchte es je einen weiteren
 * Anmeldeversuch gegen die echte Bank. Beide zu senden ist ehrlich und billig; die Sprache
 * ist ohnehin sinnvoll, wenn die Bank eine Nachricht ans Handy schickt.
 *
 * Ueberschrieben wird nichts: was die Bibliothek selbst setzt, gewinnt.
 */
let kopfzeilenInstalliert = false;
function kopfzeilenNachruesten(): void {
  if (kopfzeilenInstalliert) return;
  kopfzeilenInstalliert = true;
  const vorher = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((eingabe: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof eingabe === "string" ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url;
    if (!url.includes("hanseaticbank.de")) return vorher(eingabe, init);
    return vorher(eingabe, {
      ...init,
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        ...((init?.headers ?? {}) as Record<string, string>),
      },
    });
  }) as typeof globalThis.fetch;
}

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

/**
 * Das obere Ende eines Abrufs, um einige Tage nach hinten geschoben.
 *
 * Diese Bank vergibt Buchungsdaten, die IN DER ZUKUNFT liegen können — eine heute
 * veranlasste Überweisung trägt den Buchungstag von morgen. Der Aufrufer fragt aber bis
 * „heute", weil das bei einem Konto mit fortlaufender Buchung die richtige Grenze ist.
 *
 * Ohne diese Verschiebung fällt genau die jüngste Buchung heraus — und zwar die
 * unauffälligste Art von Fehler: der Saldo der Bank enthält sie längst, die Buchungen
 * nicht. Die App zeigt dann eine Differenz, die sie nicht erklären kann, und wer sie
 * sucht, sucht sie im Zeitraum zuletzt.
 *
 * Sieben Tage sind grosszügig genug für den Vorlauf, den diese Bank vergibt, und
 * schaden nicht: was es noch nicht gibt, kommt auch nicht zurück.
 */
const VORLAUF_TAGE = 7;

function obergrenze(bisIso: string): Date {
  const d = new Date(bisIso);
  d.setDate(d.getDate() + VORLAUF_TAGE);
  return d;
}

function heute(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

/**
 * Was die Bank gesagt hat, sichtbar machen.
 *
 * Die Bibliothek legt die Antwort der Bank gekürzt in `details` ab, ihre Meldung nennt
 * aber nur den Status. „Die Bank antwortete mit 400" ist damit alles, was ankommt — und
 * das ist die unbrauchbarste Sorte Fehlermeldung: sie sagt, dass etwas nicht ging, und
 * verschweigt als Einziges das, was weiterhülfe. Gerade bei 400 steht in der Antwort, WAS
 * der Bank fehlte.
 *
 * Angereichert wird nur ganz aussen, nach der Fallunterscheidung: `code` muss vorher
 * unangetastet bleiben, sonst greift die Freigabe-Erkennung nicht mehr.
 */
/**
 * Die bankeigenen Fehlercodes.
 *
 * Diese Bank antwortet auf eine abgelehnte Anmeldung NICHT mit den OAuth-Codes
 * (`invalid_grant`, `invalid_client`), auf die die Bibliothek prüft, sondern mit einem
 * eigenen `error_code`. Ohne diese Tabelle sieht ein falsches Passwort deshalb genauso
 * aus wie ein Transportfehler: „Die Bank antwortete mit 400" — und der Nutzer sucht an
 * der falschen Stelle.
 *
 * Die Zuordnung stammt aus dem Frontend ihrer eigenen Weboberfläche, das dieselben Codes
 * auf Meldungen abbildet. `HBSCA500` steht dort NICHT — es ist ein interner Fehler ihres
 * Bestätigungsdienstes und bleibt deshalb ohne eigene Übersetzung.
 */
const BANKCODES: Readonly<Record<string, string>> = {
  HBAUTH400: "Anmeldekennung oder Passwort stimmen nicht.",
  HBAUTH401: "Anmeldekennung oder Passwort stimmen nicht.",
  HBAUTH412: "Der Zugang ist gesperrt. Das lässt sich nur bei der Bank selbst klären.",
  HBAUTH423: "Der Zugang ist gesperrt. Das lässt sich nur bei der Bank selbst klären.",
  HBSCA400: "Die Bestätigung wurde abgelehnt.",
  HBSCA422: "Die eingegebene Bestätigung war nicht gültig.",
  HBSCA423: "Der Zugang ist gesperrt. Das lässt sich nur bei der Bank selbst klären.",
};

/**
 * Was die Bank gesagt hat, verständlich machen.
 *
 * Zuerst der bankeigene Code, dann — wenn keiner passt — wenigstens der Antworttext. Die
 * Bibliothek legt ihn gekürzt ab, ihre eigene Meldung nennt nur den Status, und „400"
 * allein ist die unbrauchbarste Sorte Fehlermeldung: sie sagt, dass etwas nicht ging, und
 * verschweigt als Einziges das, was weiterhülfe.
 *
 * Angereichert wird nur ganz aussen, nach der Fallunterscheidung: `code` muss vorher
 * unangetastet bleiben, sonst greift die Freigabe-Erkennung nicht mehr.
 */
function mitBankantwort(e: unknown): unknown {
  const f = e as { message?: unknown; details?: unknown };
  if (typeof f?.message !== "string" || typeof f?.details !== "string" || !f.details) return e;

  const code = f.details.match(/"error_code"\s*:\s*"([^"]+)"/)?.[1];
  const klartext = code ? BANKCODES[code] : undefined;
  if (klartext) return new Error(klartext, { cause: e });

  return new Error(`${f.message} — Antwort der Bank: ${f.details}`, { cause: e });
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
    const zeitraum = { from: new Date(vonIso), to: obergrenze(bisIso) };

    let seite: TransactionPage;
    try {
      seite = await this.#client.getTransactions(konto.schluessel, zeitraum);
    } catch (e) {
      if (!brauchtFreigabe(e)) throw mitBankantwort(e);
      // Ältere Buchungen liegen hinter einer zweiten Bestätigung. Die Bibliothek wirft
      // vorher, statt eine Teilmenge zu liefern — deshalb ist hier ein Wiederholen nach
      // der Freigabe richtig und kein Herumraten.
      await this.#freigeben();
      try {
        seite = await this.#client.getTransactions(konto.schluessel, zeitraum);
      } catch (zweiter) {
        throw mitBankantwort(zweiter);
      }
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
    const ergebnis = zuImportErgebnis(seite.transactions as readonly Transaction[], konto, heute());
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
      kopfzeilenNachruesten();

      const speicher = new Tokenspeicher(tokenAus(zugang.bankparameter));
      const client = fabrik({ clientBasic: zugang.token, store: speicher });

      try {
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
      } catch (e) {
        throw mitBankantwort(e);
      }

      let konten: Account[];
      try {
        konten = await client.getAccounts();
      } catch (e) {
        throw mitBankantwort(e);
      }
      const hinweise = konten.length === 0 ? ["Die Bank meldete kein Konto."] : [];
      return new Sitzung(client, speicher, konten, frageTan, hinweise);
    },
  };
}
