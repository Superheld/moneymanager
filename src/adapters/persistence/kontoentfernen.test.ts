// Ein Konto samt allem löschen — gegen echtes SQLite, mit eingeschalteten Fremdschlüsseln.
//
// **Die Fremdschlüssel sind hier der ganze Punkt**, und deshalb schaltet dieser Test sie
// ausdrücklich ein. Im übrigen Testbestand sind sie aus (sql.js, siehe `harness`), und genau
// das hat den Fehler entstehen lassen, um den es geht: die drei NO-ACTION-Verweise auf
// `zahlungskonto` fielen in keinem Testlauf auf, weil dort nie einer geprüft wurde.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("./db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, sqlLaden } from "../../testwerkzeug/harness";
import { sqliteKontoentfernen } from "./sqliteKontoentfernen";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  db.run("PRAGMA foreign_keys = ON");
  halter.setzen(pluginApi(db));
});

/** Ein Konto, ein Lauf, und was daran hängen soll. */
function bestand(): void {
  db.run(`INSERT INTO zahlungskonto (id, bezeichnung, typ, klasse, inhaber_ids, kontostand, aktiv)
          VALUES ('alt','Alte Kasse','Bargeld','liquide','[]',0,0)`);
  db.run(`INSERT INTO zahlungskonto (id, bezeichnung, typ, klasse, inhaber_ids, kontostand, aktiv)
          VALUES ('neu','Neues Giro','Giro','liquide','[]',0,1)`);
  db.run(`INSERT INTO import_lauf (id, quelle, zeitpunkt, zahlungskonto_id)
          VALUES ('l1','camt','2026-05-01T00:00:00.000Z','alt')`);
}

function buchung(id: string, kontoId: string, over: Partial<Record<string, unknown>> = {}): void {
  db.run(
    `INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle, transfer_id, gegenkonto_id)
     VALUES (?, '2026-05-04', -1200, ?, 'Aufwand', 'manuell', ?, ?)`,
    [id, kontoId, (over.transfer_id as string) ?? null, (over.gegenkonto_id as string) ?? null],
  );
}

/** Eine importierte Zahlung mit ZWEI Belegen — der Fall seit dem 06.09.2026. */
function zahlungMitZweiBelegen(zahlungId: string, zweiterBeleg: string): void {
  for (const [id, zid] of [
    [zahlungId, null],
    [zweiterBeleg, zahlungId],
  ] as const) {
    db.run(
      `INSERT INTO umsatz_roh (id, lauf_id, buchungstag, betrag, waehrung, gegenpartei,
         verwendungszweck, roh_hash, zahlung_id)
       VALUES (?, 'l1', '2026-05-04', -1200, 'EUR', 'Kesselmann', 'Zweck', ?, ?)`,
      [id, `h-${id}`, zid],
    );
  }
  db.run(
    `INSERT INTO umsatz_verarbeitung (umsatz_id, zahlungskonto_id, status, geaendert_am)
     VALUES (?, 'alt', 'verbucht', '2026-05-04T00:00:00.000Z')`,
    [zahlungId],
  );
}

describe("zaehlen", () => {
  it("zählt die drei Sperren getrennt", async () => {
    bestand();
    buchung("b1", "alt");
    buchung("b2", "alt");
    zahlungMitZweiBelegen("u1", "u1b");
    db.run(`INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am)
            VALUES ('z1','Talmberger Bank','https://example.invalid','99999999','nutzer','2026-05-01T00:00:00.000Z')`);
    db.run(`INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id)
            VALUES ('z1','k|1','alt')`);

    const l = await sqliteKontoentfernen.zaehlen("alt");
    expect(l.buchungen).toBe(2);
    // ZWEI Belege, EINE Zahlung — gezählt wird die Zahlung. Sonst stünde für dieselbe
    // Sache eine grössere Zahl da, ohne dass mehr dahinter wäre.
    expect(l.belege).toBe(1);
    expect(l.bankverbindung).toBe(true);
  });

  it("zählt ein Gegenbein auf einem ANDEREN Konto als Paarung", async () => {
    bestand();
    buchung("b1", "alt", { transfer_id: "t1", gegenkonto_id: "neu" });
    buchung("b2", "neu", { transfer_id: "t1", gegenkonto_id: "alt" });

    const l = await sqliteKontoentfernen.zaehlen("alt");
    expect(l.umbuchungspaare).toBe(1);
  });

  it("zählt eine Umbuchung INNERHALB des Kontos nicht mit", async () => {
    // Beide Beine hängen am Konto, das weggeht — es überlebt kein Bein, also ist auch
    // keine Paarung zu lösen. Ohne das `konto_id <> ?` stünde hier eine Warnung über eine
    // Gegenbuchung, die es gleich nicht mehr gibt.
    bestand();
    buchung("b1", "alt", { transfer_id: "t1", gegenkonto_id: "alt" });
    buchung("b2", "alt", { transfer_id: "t1", gegenkonto_id: "alt" });

    const l = await sqliteKontoentfernen.zaehlen("alt");
    expect(l.umbuchungspaare).toBe(0);
  });

  it("zählt die Folgen, die nur einen Verweis verlieren", async () => {
    bestand();
    db.run(`INSERT INTO kategorie (id, name, default_charakter) VALUES ('kat','Leben','Aufwand')`);
    db.run(`INSERT INTO budget (id, kategorie_id, konto_id, art, start)
            VALUES ('bu1','kat','alt','monatlich','2026-01-01')`);
    db.run(`INSERT INTO ruecklage (id, bezeichnung, beginn, konto_id, rate)
            VALUES ('r1','Urlaub','2026-01-01','alt',10000)`);
    db.run(`INSERT INTO zahlungsregel (id, bezeichnung, betrag, rhythmus, startdatum, charakter, konto_id)
            VALUES ('zr1','Sparen',-10000,'monatlich','2026-01-01','Umschichtung','alt')`);

    const l = await sqliteKontoentfernen.zaehlen("alt");
    expect(l.budgets).toBe(1);
    expect(l.ruecklagen).toBe(1);
    expect(l.regeln).toBe(1);
    // Und keine davon sperrt.
    expect(l.buchungen).toBe(0);
  });
});

describe("vollstaendig", () => {
  it("nimmt Buchungen, ALLE Belege und die Bankverbindung mit", async () => {
    bestand();
    buchung("b1", "alt");
    zahlungMitZweiBelegen("u1", "u1b");
    db.run(`INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am)
            VALUES ('z1','Talmberger Bank','https://example.invalid','99999999','nutzer','2026-05-01T00:00:00.000Z')`);
    db.run(`INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id)
            VALUES ('z1','k|1','alt')`);

    await sqliteKontoentfernen.vollstaendig("alt");

    expect(db.exec("SELECT id FROM zahlungskonto")[0].values).toEqual([["neu"]]);
    expect(db.exec("SELECT id FROM ist_buchung")).toEqual([]);
    // BEIDE Belege der Zahlung, nicht nur der namengebende: eine Zahlung ohne ihren ersten
    // Beleg wäre eine, deren Herkunft niemand mehr feststellen kann.
    expect(db.exec("SELECT id FROM umsatz_roh")).toEqual([]);
    expect(db.exec("SELECT umsatz_id FROM umsatz_verarbeitung")).toEqual([]);
    expect(db.exec("SELECT zugang_id FROM bankkonto_zuordnung")).toEqual([]);
    // Der Zugang selbst bleibt — er kann weitere Konten führen.
    expect(db.exec("SELECT id FROM bankzugang")[0].values).toEqual([["z1"]]);
  });

  it("schreibt für jede gelöschte Buchung einen Journaleintrag", async () => {
    // Der Inhalt bleibt feststellbar, obwohl die Zeile weg ist. `buchung_journal` trägt
    // bewusst keinen Fremdschlüssel auf `ist_buchung` und überlebt deshalb die Löschung.
    bestand();
    buchung("b1", "alt");
    buchung("b2", "alt");

    await sqliteKontoentfernen.vollstaendig("alt");

    const eintraege = db.exec("SELECT istbuchung_id, art, nachher FROM buchung_journal ORDER BY istbuchung_id")[0];
    expect(eintraege.values).toEqual([
      ["b1", "geloescht", null],
      ["b2", "geloescht", null],
    ]);
    // Und der Inhalt steht drin.
    const vorher = db.exec("SELECT vorher FROM buchung_journal WHERE istbuchung_id = 'b1'")[0].values[0][0];
    expect(String(vorher)).toMatch(/"betrag":-1200/);
  });

  it("löst die Paarung des überlebenden Gegenbeins, statt es mitzunehmen", async () => {
    // Das Gegenbein liegt auf einem Konto, das jemand weiterführt — eine Zahlung dort ist
    // eine Tatsache, die mit dem gelöschten Konto nichts zu tun hat. Bliebe `transfer_id`
    // dagegen stehen, zeigte sie auf ein Paar, das es nicht mehr gibt (sie trägt keinen
    // Fremdschlüssel, der das aufräumen würde).
    bestand();
    buchung("b1", "alt", { transfer_id: "t1", gegenkonto_id: "neu" });
    buchung("b2", "neu", { transfer_id: "t1", gegenkonto_id: "alt" });

    await sqliteKontoentfernen.vollstaendig("alt");

    const uebrig = db.exec("SELECT id, transfer_id, gegenkonto_id FROM ist_buchung")[0];
    expect(uebrig.values).toEqual([["b2", null, null]]);
    // MIT Journaleintrag: eine Buchung, die still ihre Paarung verliert, wäre später nicht
    // zu erklären.
    const art = db.exec("SELECT art FROM buchung_journal WHERE istbuchung_id = 'b2'")[0].values[0][0];
    expect(art).toBe("geaendert");
  });

  it("lässt Budgets, Rücklagen und Regeln stehen — ohne ihren Kontobezug", async () => {
    bestand();
    db.run(`INSERT INTO kategorie (id, name, default_charakter) VALUES ('kat','Leben','Aufwand')`);
    db.run(`INSERT INTO budget (id, kategorie_id, konto_id, art, start)
            VALUES ('bu1','kat','alt','monatlich','2026-01-01')`);
    db.run(`INSERT INTO ruecklage (id, bezeichnung, beginn, konto_id, rate)
            VALUES ('r1','Urlaub','2026-01-01','alt',10000)`);

    await sqliteKontoentfernen.vollstaendig("alt");

    expect(db.exec("SELECT id, konto_id FROM budget")[0].values).toEqual([["bu1", null]]);
    expect(db.exec("SELECT id, konto_id FROM ruecklage")[0].values).toEqual([["r1", null]]);
  });

  it("nimmt Anker und Vormerkungen per Kaskade mit", async () => {
    bestand();
    db.run(`INSERT INTO kontostand_anker (konto_id, datum, herkunft, betrag, erfasst_am)
            VALUES ('alt','2026-05-01','manuell',0,'2026-05-01T00:00:00.000Z')`);
    db.run(`INSERT INTO vormerkung (id, zahlungskonto_id, betrag, waehrung, gegenpartei,
              verwendungszweck, erfasst_am)
            VALUES ('v1','alt',-500,'EUR','Kesselmann','','2026-05-01T00:00:00.000Z')`);

    await sqliteKontoentfernen.vollstaendig("alt");

    expect(db.exec("SELECT konto_id FROM kontostand_anker")).toEqual([]);
    expect(db.exec("SELECT id FROM vormerkung")).toEqual([]);
  });

  it("lässt ein Konto ohne alles genauso gehen", async () => {
    // Der Weg muss auch dann tragen, wenn es nichts zu löschen gibt: eine leere
    // Werteliste in einem `IN (…)` wäre ungültiges SQL, und der Fall ist nicht selten.
    bestand();

    await sqliteKontoentfernen.vollstaendig("alt");

    expect(db.exec("SELECT id FROM zahlungskonto")[0].values).toEqual([["neu"]]);
  });

  it("rührt die Buchungen des ANDEREN Kontos nicht an", async () => {
    bestand();
    buchung("b1", "alt");
    buchung("b2", "neu");

    await sqliteKontoentfernen.vollstaendig("alt");

    expect(db.exec("SELECT id FROM ist_buchung")[0].values).toEqual([["b2"]]);
  });
});
