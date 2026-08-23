import { describe, expect, it, vi } from "vitest";
import { hanseaticAdapter, zuBankkonto, type Bankclient } from "./hanseaticAdapter";
import type { Bankzugang, TanHerausforderung } from "../../application/fints/abrufPort";
import type { Account, Transaction, TransactionPage } from "../../vendor/hanseatic-bank/types.js";

const ZUGANG: Bankzugang = {
  id: "z1",
  bezeichnung: "Testbank",
  art: "hanseatic",
  url: "https://connect.example.invalid",
  blz: "",
  benutzer: "0000000000", // privacy-ok — erfundener Testwert
  token: "dGVzdDp0ZXN0", // privacy-ok — erfundener Testwert
};

function konto(ueber: Partial<Account> = {}): Account {
  return {
    id: "1234567890", // privacy-ok — erfundener Testwert
    holder: "Test Person",
    iban: "DE00000000000000000000", // privacy-ok — erfundener Testwert
    productLabel: "Testkarte",
    balance: -102.55,
    currency: "EUR",
    ...ueber,
  };
}

function buchung(ueber: Partial<Transaction> = {}): Transaction {
  return {
    type: "card",
    bookingDate: "2026-03-11",
    purchaseDate: "2026-03-05",
    amount: -12.34,
    currency: "EUR",
    direction: "debit",
    description: "Zahlung",
    booked: true,
    ...ueber,
  };
}

function seite(ueber: Partial<TransactionPage> = {}): TransactionPage {
  return { transactions: [buchung()], oldestReached: "2026-03-05", reachedFrom: true, ...ueber };
}

/** Eine Bank-Attrappe. Was sie tut, bestimmt jeder Testfall selbst. */
function attrappe(ueber: Partial<Bankclient> = {}) {
  const protokoll: string[] = [];
  const client: Bankclient = {
    async login(_c, opts) {
      protokoll.push("login");
      opts?.onChallenge?.();
    },
    async elevate(opts) {
      protokoll.push("elevate");
      opts.onConfirm();
    },
    async getAccounts() {
      protokoll.push("getAccounts");
      return [konto()];
    },
    async getTransactions() {
      protokoll.push("getTransactions");
      return seite();
    },
    ...ueber,
  };
  return { client, protokoll, fabrik: () => client };
}

/** Sammelt die Rückfragen, die an die Oberfläche gingen. */
function tanSammler() {
  const gefragt: TanHerausforderung[] = [];
  return {
    gefragt,
    frager: async (h: TanHerausforderung) => {
      gefragt.push(h);
      return undefined;
    },
  };
}

describe("anmelden", () => {
  it("verlangt den Ausweis der Anwendung und sagt, warum", async () => {
    const { fabrik } = attrappe();
    const ohne = { ...ZUGANG, token: undefined };
    await expect(hanseaticAdapter(fabrik).anmelden(ohne, "geheim", async () => undefined))
      .rejects.toThrow(/Ausweis/);
  });

  it("meldet sich an und liefert die Konten", async () => {
    const { fabrik, protokoll } = attrappe();
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);
    expect(protokoll).toEqual(["login", "getAccounts"]);
    expect(s.konten).toHaveLength(1);
    expect(s.konten[0]?.bezeichnung).toBe("Testkarte");
  });

  // Diese Bank kennt keine eingetippte TAN. Käme die Rückfrage ohne `decoupled`, böte die
  // Oberfläche ein Eingabefeld für etwas an, das es nicht gibt.
  it("fragt die Bestätigung als decoupled an, nie als Eingabe", async () => {
    const { fabrik } = attrappe();
    const tan = tanSammler();
    await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", tan.frager);
    expect(tan.gefragt).toHaveLength(1);
    expect(tan.gefragt[0]?.decoupled).toBe(true);
    expect(tan.gefragt[0]?.bild).toBeUndefined();
  });

  // "Die Bank antwortete mit 400" ist die unbrauchbarste Sorte Fehlermeldung: sie sagt,
  // dass etwas nicht ging, und verschweigt als Einziges das, was weiterhuelfe. Gerade bei
  // 400 steht in der Antwort, WAS der Bank fehlte.
  it("reicht die Antwort der Bank mit durch, nicht nur den Status", async () => {
    const { fabrik } = attrappe({
      async login() {
        throw Object.assign(new Error("Die Bank antwortete mit 400 auf /token"), {
          code: "http",
          status: 400,
          details: '{"error":"invalid_request"}',
        });
      },
    });
    await expect(hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined))
      .rejects.toThrow(/invalid_request/);
  });

  // Diese Bank antwortet auf ein falsches Passwort NICHT mit den OAuth-Codes, auf die die
  // Bibliothek prueft, sondern mit einem eigenen. Ohne Uebersetzung sieht ein Tippfehler
  // deshalb aus wie ein Transportproblem — und man sucht an der falschen Stelle.
  it("nennt falsche Zugangsdaten beim Namen, statt den Status zu melden", async () => {
    const { fabrik } = attrappe({
      async login() {
        throw Object.assign(new Error("Die Bank antwortete mit 400 auf /token"), {
          code: "http",
          status: 400,
          details: '{"error_code":"HBAUTH401"}',
        });
      },
    });
    await expect(hanseaticAdapter(fabrik).anmelden(ZUGANG, "falsch", async () => undefined))
      .rejects.toThrow(/Anmeldekennung oder Passwort/);
  });

  it("erkennt einen gesperrten Zugang", async () => {
    const { fabrik } = attrappe({
      async login() {
        throw Object.assign(new Error("Die Bank antwortete mit 400 auf /token"), {
          code: "http",
          status: 400,
          details: '{"error_code":"HBAUTH423"}',
        });
      },
    });
    await expect(hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined))
      .rejects.toThrow(/gesperrt/);
  });

  it("laesst einen Fehler ohne Antworttext unveraendert", async () => {
    const { fabrik } = attrappe({
      async login() {
        throw new Error("Verbindung zur Bank fehlgeschlagen");
      },
    });
    await expect(hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined))
      .rejects.toThrow(/^Verbindung zur Bank fehlgeschlagen$/);
  });

  it("meldet ein leeres Konten-Ergebnis als Hinweis, statt still nichts zu liefern", async () => {
    const { fabrik } = attrappe({ async getAccounts() { return []; } });
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);
    expect(s.konten).toEqual([]);
    expect(s.hinweise.join(" ")).toMatch(/kein Konto/);
  });
});

describe("die Konten der Bank", () => {
  it("tragen ihre Fähigkeiten — und Depot gehört nicht dazu", () => {
    const k = zuBankkonto(konto());
    expect(k.kannSaldo).toBe(true);
    expect(k.kannUmsaetze).toBe(true);
    expect(k.kannDepot).toBe(false);
  });

  it("nutzen die Kontonummer als Schlüssel, ohne Unterkonto zu erfinden", () => {
    const k = zuBankkonto(konto());
    expect(k.schluessel).toBe(k.nummer);
    expect(k.unterkonto).toBeUndefined();
  });
});

describe("Saldo", () => {
  it("kommt aus der Kontenliste, in Minor Units, ohne zweiten Aufruf", async () => {
    const { fabrik, protokoll } = attrappe();
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);
    protokoll.length = 0;

    const saldo = await s.saldo(s.konten[0]!);
    expect(saldo?.betrag).toBe(-10255);
    expect(saldo?.waehrung).toBe("EUR");
    // Kein weiterer Aufruf an die Bank: der Wert lag schon vor.
    expect(protokoll).toEqual([]);
  });

  it("liefert null für ein Konto, das die Bank nicht kennt", async () => {
    const { fabrik } = attrappe();
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);
    expect(await s.saldo({ ...s.konten[0]!, schluessel: "fremd" })).toBeNull();
  });
});

describe("Umsätze", () => {
  it("übersetzt die Buchungen ins kanonische Ergebnis", async () => {
    const { fabrik } = attrappe();
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);

    const a = await s.umsaetze(s.konten[0]!, "2026-03-01", "2026-03-31");
    expect(a.ergebnis.umsaetze).toHaveLength(1);
    expect(a.ergebnis.umsaetze[0]?.betrag).toBe(-1234);
    expect(a.ergebnis.umsaetze[0]?.kontoIban).toBe("DE00000000000000000000"); // privacy-ok — erfundener Testwert
    expect(a.auszugsSalden).toEqual([]);
  });

  // Der Kern des zweistufigen Zugriffs: ältere Buchungen liegen hinter einer zweiten
  // Bestätigung. Die Bibliothek wirft vorher, statt eine Teilmenge zu liefern.
  it("holt die Freigabe nach und wiederholt den Abruf", async () => {
    let ersterVersuch = true;
    const { fabrik, protokoll } = attrappe({
      async getTransactions() {
        protokoll.push("getTransactions");
        if (ersterVersuch) {
          ersterVersuch = false;
          throw Object.assign(new Error("erst bestätigen"), { code: "not_elevated" });
        }
        return seite();
      },
    });
    const tan = tanSammler();
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", tan.frager);
    protokoll.length = 0;
    tan.gefragt.length = 0;

    const a = await s.umsaetze(s.konten[0]!, "2025-01-01", "2026-03-31");

    expect(protokoll).toEqual(["getTransactions", "elevate", "getTransactions"]);
    expect(a.ergebnis.umsaetze).toHaveLength(1);
    expect(tan.gefragt[0]?.decoupled).toBe(true);
  });

  it("reicht einen anderen Fehler durch, statt blind freizuschalten", async () => {
    const { fabrik, protokoll } = attrappe({
      async getTransactions() {
        protokoll.push("getTransactions");
        throw Object.assign(new Error("kaputt"), { code: "http" });
      },
    });
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);
    protokoll.length = 0;

    await expect(s.umsaetze(s.konten[0]!, "2026-03-01", "2026-03-31")).rejects.toThrow(/kaputt/);
    expect(protokoll).toEqual(["getTransactions"]); // kein elevate
  });

  // „Alles, was zu haben war" ist nicht dasselbe wie „der Zeitraum ist abgedeckt".
  it("sagt es, wenn die Historie nicht so weit zurückreicht", async () => {
    const { fabrik } = attrappe({
      async getTransactions() {
        return seite({ reachedFrom: false, oldestReached: "2026-01-02" });
      },
    });
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);

    const a = await s.umsaetze(s.konten[0]!, "2020-01-01", "2026-03-31");
    expect(a.hinweise.join(" ")).toMatch(/2026-01-02/);
  });

  it("meldet einen leeren Abruf als Hinweis", async () => {
    const { fabrik } = attrappe({
      async getTransactions() {
        return seite({ transactions: [], oldestReached: "", reachedFrom: false });
      },
    });
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);

    const a = await s.umsaetze(s.konten[0]!, "2026-03-01", "2026-03-31");
    expect(a.ergebnis.umsaetze).toEqual([]);
    expect(a.hinweise.join(" ")).toMatch(/nichts/);
  });
});

describe("was aufbewahrt wird", () => {
  it("gibt das gemerkte Gerät zurück, damit es der Zugang speichern kann", async () => {
    const { fabrik } = attrappe({
      async login(_c, opts) {
        opts?.onChallenge?.();
      },
    });
    const adapter = hanseaticAdapter((c) => {
      // Die Bank meldet beim Anmelden ein frisches Gerätetoken.
      void c.store.setDeviceToken("egal", "geraet-xyz");
      return fabrik();
    });
    const s = await adapter.anmelden(ZUGANG, "geheim", async () => undefined);
    expect(JSON.parse(s.bankparameter())).toEqual({ geraetetoken: "geraet-xyz" });
  });

  it("nimmt ein zuvor gemerktes Gerät wieder auf", async () => {
    const gesehen = vi.fn();
    const adapter = hanseaticAdapter((c) => {
      void c.store.getDeviceToken("egal").then(gesehen);
      return attrappe().client;
    });
    await adapter.anmelden(
      { ...ZUGANG, bankparameter: JSON.stringify({ geraetetoken: "alt-xyz" }) },
      "geheim",
      async () => undefined,
    );
    expect(gesehen).toHaveBeenCalledWith("alt-xyz");
  });

  // Unlesbares heisst „nichts gemerkt" — der nächste Versuch klingelt einmal und legt ein
  // frisches Token an. Ärgerlich, aber nicht kaputt; ein Absturz wäre schlimmer.
  it("verträgt unlesbare Bankparameter", async () => {
    const { fabrik } = attrappe();
    const s = await hanseaticAdapter(fabrik).anmelden(
      { ...ZUGANG, bankparameter: "kein json" },
      "geheim",
      async () => undefined,
    );
    expect(JSON.parse(s.bankparameter())).toEqual({ geraetetoken: "" });
  });
});

describe("Depot", () => {
  it("gibt null — diese Bank führt keine", async () => {
    const { fabrik } = attrappe();
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);
    expect(await s.depot(s.konten[0]!)).toBeNull();
  });
});

describe("Profil", () => {
  it("meldet die App-Bestätigung als einziges, decoupled Verfahren", async () => {
    const { fabrik } = attrappe();
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);
    expect(s.profil.tanVerfahren).toHaveLength(1);
    expect(s.profil.tanVerfahren[0]?.decoupled).toBe(true);
  });

  // Vorfälle sind FinTS-Segmente. Ein erfundenes hineinzuschreiben hiesse, eine
  // Fähigkeitsmeldung zu behaupten, die es nicht gibt.
  it("meldet keine Geschäftsvorfälle, weil diese Bank keine kennt", async () => {
    const { fabrik } = attrappe();
    const s = await hanseaticAdapter(fabrik).anmelden(ZUGANG, "geheim", async () => undefined);
    expect(s.profil.vorfaelle).toEqual([]);
    expect(s.profil.kontoVorfaelle).toEqual({});
  });
});
