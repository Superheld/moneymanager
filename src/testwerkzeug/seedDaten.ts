// Der SPIELSTAND: erfundene Daten, reich genug, dass jeder Bereich der App etwas
// anzuzeigen hat.
//
// Getrennt vom Skript, das ihn schreibt (`scripts/seed-anlegen.mjs`), weil ein Seed
// still verrottet: das Schema wandert, die INSERTs bleiben stehen, und der Fehler zeigt
// sich erst, wenn jemand ihn benutzen will. `src/seed.test.ts` faehrt ihn deshalb bei
// jedem `npm test` gegen die aktuelle Migrationskette.
//
// ALLE WERTE SIND ERFUNDEN. Die Anbieternamen sind sektorneutral gewaehlt — man soll
// ihnen die Kategorie NICHT ansehen, sonst verraet die Fixture ueber ihre Kombination
// dasselbe wie echte Daten (Regel 2 in `src/CLAUDE.md`). Die IBANs tragen eine
// Bankleitzahl aus dem Bereich 999999xx, den es nicht gibt, mit gerechneter Pruefziffer.
//
// Der Zufall ist GESAET und damit wiederholbar: derselbe Aufruf erzeugt denselben
// Bestand. Ein Screenshot von gestern zeigt dieselben Zahlen wie einer von heute, und ein
// Fehler, den man im Spielstand findet, ist morgen noch da.
//
// Diese Datei ist Werkzeug und aus der Coverage ausgenommen.

/** Was der Seed von einer Datenbank braucht — bewusst weniger als sql.js bietet. */
export interface SeedDb {
  run(sql: string, werte?: (string | number | null)[]): unknown;
}

/** Wie viele Monate zurueck der Spielstand reicht. */
export const MONATE = 8;

/** Gesaeter Zufall (mulberry32) — wiederholbar, siehe Kopf. */
function wuerfel(saat: number): () => number {
  let a = saat;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * IBAN mit einer BLZ, die es nicht gibt (Bereich 999999xx), Pruefziffer gerechnet.
 * Eine IBAN mit echter BLZ koennte zu einem echten Konto gehoeren — ob die Kontonummer
 * dahinter vergeben ist, weiss hier niemand.
 */
export function iban(blz: string, kontonummer: number): string {
  const bban = blz + String(kontonummer).padStart(10, "0");
  let rest = 0;
  for (const ziffer of bban + "131400") rest = (rest * 10 + Number(ziffer)) % 97;
  return "DE" + String(98 - rest).padStart(2, "0") + bban;
}

/** ISO-Datum aus lokalen Bestandteilen — nie ueber toISOString, das verschiebt den Tag. */
const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Fuellt eine bereits MIGRIERTE Datenbank mit dem Spielstand.
 *
 * `stichtag` ist der Tag, von dem aus gerechnet wird — im Test fest, im Skript heute.
 * Ohne dieses Argument haenge der Bestand am Kalender, und der Test pruefte an einem
 * Monatsersten etwas anderes als am Monatsletzten.
 */
export function seedEinspielen(db: SeedDb, stichtag: Date = new Date()): void {
  const zufall = wuerfel(20260824);
  const zahlZwischen = (von: number, bis: number) => von + Math.floor(zufall() * (bis - von + 1));
  const einesVon = <T,>(liste: readonly T[]): T => liste[Math.floor(zufall() * liste.length)];

  const monat = (versatz: number) =>
    iso(new Date(stichtag.getFullYear(), stichtag.getMonth() + versatz, 1)).slice(0, 7);
  const tagIn = (versatz: number, tag: number) => {
    const letzter = new Date(stichtag.getFullYear(), stichtag.getMonth() + versatz + 1, 0).getDate();
    return iso(
      new Date(stichtag.getFullYear(), stichtag.getMonth() + versatz, Math.min(tag, letzter)),
    );
  };
  const JETZT = new Date(stichtag.getTime()).toISOString();
  const setzen = (sql: string, werte?: (string | number | null)[]) => db.run(sql, werte);

  // Sektorneutrale Fantasienamen: keiner laesst auf seine Kategorie schliessen.
  const GEGENPARTEIEN = {
    lebensmittel: ["Kesselmann", "Aukamp", "Rinsche", "Belvo"],
    freizeit: ["Trentmoor", "Oemke", "Sindler"],
    mobilitaet: ["Varnhold", "Petrell"],
    gesundheit: ["Lauterbek", "Norhast"],
    anschaffung: ["Dessloch", "Weimbrand"],
  };

  // ------------------------------------------------------------ Stammdaten

  setzen("INSERT INTO einstellung (schluessel, wert) VALUES (?, ?)", ["locale", "de-DE"]);
  setzen("INSERT INTO person (id, name, rolle) VALUES (?, ?, ?)", [
    "person-1",
    "Haushalt",
    "inhaber",
  ]);

  const konten = [
    { id: "konto-giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", iban: iban("99999901", 1002003), stand: 248000 },
    { id: "konto-bar", bezeichnung: "Haushaltskasse", typ: "Bargeld", klasse: "liquide", iban: null, stand: 12500 },
    { id: "konto-tagesgeld", bezeichnung: "Ruecklage", typ: "Tagesgeld", klasse: "ruecklage", iban: iban("99999902", 4005006), stand: 890000 },
    { id: "konto-kk", bezeichnung: "Kreditkarte", typ: "Kreditkarte", klasse: "liquide", iban: null, stand: -32000 },
  ];
  for (const k of konten) {
    setzen(
      "INSERT INTO zahlungskonto (id, bezeichnung, typ, iban, inhaber_ids, kontostand, klasse) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [k.id, k.bezeichnung, k.typ, k.iban, '["person-1"]', k.stand, k.klasse],
    );
    // Ein Anker je Konto: der Stand, gegen den der Verlauf rechnet.
    setzen(
      "INSERT INTO kontostand_anker (konto_id, datum, herkunft, betrag, erfasst_am) VALUES (?, ?, ?, ?, ?)",
      [k.id, tagIn(-MONATE, 1), "hand", k.stand, JETZT],
    );
  }

  // Der Baum: Oberkategorie, darunter das Feine. `default_charakter` entscheidet, wohin
  // eine Buchung ohne eigene Angabe faellt.
  const kategorien = [
    { id: "kat-wohnen", name: "Wohnen", eltern: null, charakter: "Aufwand" },
    { id: "kat-miete", name: "Miete", eltern: "kat-wohnen", charakter: "Aufwand" },
    { id: "kat-energie", name: "Energie", eltern: "kat-wohnen", charakter: "Aufwand" },
    { id: "kat-internet", name: "Internet und Telefon", eltern: "kat-wohnen", charakter: "Aufwand" },
    { id: "kat-lebensmittel", name: "Lebensmittel", eltern: null, charakter: "Aufwand" },
    { id: "kat-mobilitaet", name: "Mobilitaet", eltern: null, charakter: "Aufwand" },
    { id: "kat-versicherung", name: "Versicherungen", eltern: null, charakter: "Aufwand" },
    { id: "kat-gesundheit", name: "Gesundheit", eltern: null, charakter: "Aufwand" },
    { id: "kat-freizeit", name: "Freizeit", eltern: null, charakter: "Aufwand" },
    { id: "kat-anschaffung", name: "Anschaffungen", eltern: null, charakter: "Aufwand" },
    { id: "kat-steuern", name: "Steuern und Abgaben", eltern: null, charakter: "Aufwand" },
    { id: "kat-gehalt", name: "Gehalt", eltern: null, charakter: "Ertrag" },
    { id: "kat-sonstige-ertrag", name: "Sonstige Einnahmen", eltern: null, charakter: "Ertrag" },
    { id: "kat-uebertrag", name: "Uebertrag", eltern: null, charakter: "Umschichtung" },
  ];
  for (const k of kategorien) {
    setzen("INSERT INTO kategorie (id, name, eltern_id, default_charakter) VALUES (?, ?, ?, ?)", [
      k.id,
      k.name,
      k.eltern,
      k.charakter,
    ]);
  }

  // ------------------------------------------------------------ Budgets

  // Die Betraege sind eine REIHE mit Geltungsmonat — deshalb bekommt eines davon bewusst
  // zwei Versionen: so zeigt der Spielstand den Fall, fuer den `budget_betrag` ueberhaupt
  // existiert (eine Aenderung schreibt die Vergangenheit nicht um).
  const budgets = [
    {
      id: "budget-lebensmittel",
      kategorie: "kat-lebensmittel",
      art: "monatlich",
      betraege: [
        { ab: monat(-MONATE), betrag: 45000 },
        { ab: monat(-2), betrag: 52000 },
      ],
    },
    {
      id: "budget-freizeit",
      kategorie: "kat-freizeit",
      art: "monatlich",
      betraege: [{ ab: monat(-MONATE), betrag: 18000 }],
    },
    {
      id: "budget-anschaffung",
      kategorie: "kat-anschaffung",
      art: "aufbauend",
      betraege: [{ ab: monat(-MONATE), betrag: 15000 }],
    },
  ];
  for (const b of budgets) {
    setzen("INSERT INTO budget (id, kategorie_id, konto_id, art, start) VALUES (?, ?, ?, ?, ?)", [
      b.id,
      b.kategorie,
      null,
      b.art,
      monat(-MONATE),
    ]);
    for (const v of b.betraege) {
      setzen("INSERT INTO budget_betrag (budget_id, ab_monat, betrag) VALUES (?, ?, ?)", [
        b.id,
        v.ab,
        v.betrag,
      ]);
    }
  }

  // ------------------------------------------------------------ Vertraege und Inventar

  const vertraege = [
    { id: "vertrag-internet", anbieter: "Halvern", kategorie: "kat-internet", betrag: -4500 },
    { id: "vertrag-versicherung", anbieter: "Mordhorst", kategorie: "kat-versicherung", betrag: -8900 },
  ];
  for (const v of vertraege) {
    setzen(
      "INSERT INTO vertrag (id, anbieter, vertragsnummer, inhaber_id, beginn, verlaengerung, verlaengerung_monate, kuendigungsfrist_monate, status, kategorie_id, art) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [v.id, v.anbieter, null, "person-1", tagIn(-MONATE, 1), "automatisch", 12, 3, "aktiv", v.kategorie, "abo"],
    );
    setzen(
      "INSERT INTO vertrag_erkennung (vertrag_id, schluessel, betrag_von, betrag_bis, konto_id) VALUES (?, ?, ?, ?, ?)",
      [v.id, v.anbieter.toLowerCase(), v.betrag - 500, v.betrag + 500, "konto-giro"],
    );
  }

  // Wiederbeschaffung geteilt durch Nutzungsdauer ergibt die monatliche Ruecklage.
  const inventar = [
    { id: "inv-1", bezeichnung: "Waschmaschine", wert: 68000, monate: 120 },
    { id: "inv-2", bezeichnung: "Notebook", wert: 145000, monate: 60 },
    { id: "inv-3", bezeichnung: "Fahrrad", wert: 92000, monate: 96 },
  ];
  for (const i of inventar) {
    setzen(
      "INSERT INTO inventargegenstand (id, bezeichnung, wiederbeschaffung, nutzungsdauer_monate, anschaffung, kategorie_id, konto_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [i.id, i.bezeichnung, i.wert, i.monate, tagIn(-MONATE - 12, 10), "kat-anschaffung", "konto-tagesgeld"],
    );
  }

  // ------------------------------------------------------------ Depot

  // Beobachtungen zu Stichtagen, keine Buchungen — deshalb kein Saldo und keine
  // Kontenliste. Braucht einen Bankzugang als Traeger.
  setzen(
    "INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am, art) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["zugang-1", "Depotbank", "https://example.invalid/fints", "99999903", "spielstand", JETZT, "fints"],
  );
  setzen("INSERT INTO depot (id, zugang_id, schluessel, bezeichnung, waehrung) VALUES (?, ?, ?, ?, ?)", [
    "depot-1",
    "zugang-1",
    "D-1",
    "Wertpapierdepot",
    "EUR",
  ]);
  let depotwert = 1240000;
  for (let m = MONATE; m >= 0; m--) {
    depotwert = Math.round(depotwert * (1 + (zufall() - 0.42) / 22));
    setzen("INSERT INTO depotwert (depot_id, stichtag, gesamtwert, erfasst_am) VALUES (?, ?, ?, ?)", [
      "depot-1",
      tagIn(-m, 1),
      depotwert,
      JETZT,
    ]);
  }
  for (const p of [
    { kennung: "P1", name: "Sammelanlage Breit", anteil: 0.62 },
    { kennung: "P2", name: "Sammelanlage Schmal", anteil: 0.38 },
  ]) {
    const wert = Math.round(depotwert * p.anteil);
    setzen(
      "INSERT INTO depotposition (depot_id, stichtag, kennung, name, stueck, kurs, wert, waehrung) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ["depot-1", tagIn(0, 1), p.kennung, p.name, Math.round(wert / 8500), 85.0, wert, "EUR"],
    );
  }

  // ------------------------------------------------------------ Buchungen

  let lfd = 0;
  const buchung = (
    datum: string,
    betrag: number,
    kontoId: string,
    kategorieId: string,
    charakter: string,
  ): string => {
    const id = `buchung-${String(++lfd).padStart(4, "0")}`;
    setzen(
      "INSERT INTO ist_buchung (id, datum, betrag, konto_id, kategorie_id, charakter, quelle, kategorie_herkunft, zu_pruefen) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
      [id, datum, betrag, kontoId, kategorieId, charakter, "manuell", "manuell"],
    );
    return id;
  };

  for (let m = MONATE; m >= 0; m--) {
    // Wiederkehrendes — das Geruest, an dem der Monatsverlauf haengt
    buchung(tagIn(-m, 28), 315000, "konto-giro", "kat-gehalt", "Ertrag");
    buchung(tagIn(-m, 1), -98000, "konto-giro", "kat-miete", "Aufwand");
    buchung(tagIn(-m, 5), -4500, "konto-giro", "kat-internet", "Aufwand");
    buchung(tagIn(-m, 15), -8900, "konto-giro", "kat-versicherung", "Aufwand");
    buchung(tagIn(-m, 8), -zahlZwischen(6000, 11000), "konto-giro", "kat-energie", "Aufwand");
    // Eine Umschichtung hat ZWEI Seiten — sonst zeigt der Verlauf einen Stand, den es nie gab.
    buchung(tagIn(-m, 2), -30000, "konto-giro", "kat-uebertrag", "Umschichtung");
    buchung(tagIn(-m, 2), 30000, "konto-tagesgeld", "kat-uebertrag", "Umschichtung");

    // Alltag — streut, damit die Budgets mal passen und mal nicht
    for (let i = 0; i < zahlZwischen(6, 10); i++) {
      buchung(
        tagIn(-m, zahlZwischen(2, 27)),
        -zahlZwischen(1800, 9500),
        einesVon(["konto-giro", "konto-bar", "konto-kk"]),
        "kat-lebensmittel",
        "Aufwand",
      );
    }
    for (let i = 0; i < zahlZwischen(1, 4); i++) {
      buchung(tagIn(-m, zahlZwischen(3, 26)), -zahlZwischen(1200, 7800), "konto-kk", "kat-freizeit", "Aufwand");
    }
    for (let i = 0; i < zahlZwischen(1, 3); i++) {
      buchung(tagIn(-m, zahlZwischen(3, 26)), -zahlZwischen(900, 5400), "konto-giro", "kat-mobilitaet", "Aufwand");
    }
    if (zufall() < 0.45) {
      buchung(tagIn(-m, zahlZwischen(5, 24)), -zahlZwischen(2500, 18000), "konto-giro", "kat-gesundheit", "Aufwand");
    }
    if (zufall() < 0.3) {
      buchung(tagIn(-m, zahlZwischen(5, 24)), -zahlZwischen(8000, 42000), "konto-tagesgeld", "kat-anschaffung", "Aufwand");
    }
  }

  // Ein Rueckfluss — Aufwand mit POSITIVEM Betrag, in der Kategorie der Ausgabe. Der Fall
  // steht ausdruecklich in der Wurzel-`CLAUDE.md`, und ohne ihn im Spielstand faellt eine
  // Regression daran erst am echten Bestand auf.
  buchung(tagIn(-1, 20), 6400, "konto-giro", "kat-gesundheit", "Aufwand");
  // Dasselbe eine Ebene groesser: eine Steuerrueckerstattung gehoert zu „Steuern", auch
  // wenn die urspruengliche Zahlung gar nicht im Bestand steht.
  buchung(tagIn(-3, 12), 48500, "konto-giro", "kat-steuern", "Aufwand");

  // Eine aufgeteilte Buchung. Summe der Teile MUSS dem Betrag entsprechen — das setzt der
  // Kern voraus, und der Spielstand soll den Fall enthalten, nicht nur den Normalfall.
  const geteilt = buchung(tagIn(-1, 14), -12600, "konto-giro", "kat-lebensmittel", "Aufwand");
  setzen(
    "INSERT INTO ist_buchung_aufteilung (id, istbuchung_id, kategorie_id, betrag, notiz) VALUES (?, ?, ?, ?, ?)",
    ["teil-1", geteilt, "kat-lebensmittel", -8100, null],
  );
  setzen(
    "INSERT INTO ist_buchung_aufteilung (id, istbuchung_id, kategorie_id, betrag, notiz) VALUES (?, ?, ?, ?, ?)",
    ["teil-2", geteilt, "kat-anschaffung", -4500, null],
  );

  // ------------------------------------------------------------ Posteingang

  // Ein Lauf mit offenen Zeilen, damit die Durchsicht nicht leer ist. Der Beleg steht in
  // `umsatz_roh` (nach dem Anlegen unveraenderlich), der Stand in `umsatz_verarbeitung`.
  setzen(
    "INSERT INTO import_lauf (id, quelle, zeitpunkt, dateiname, eingelesen, neu, duplikate, zahlungskonto_id, format) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["lauf-1", "datei", JETZT, "auszug.csv", 6, 6, 0, "konto-giro", "camt"],
  );
  const posteingang = [
    { partei: einesVon(GEGENPARTEIEN.lebensmittel), betrag: -4230, zweck: "Einkauf" },
    { partei: einesVon(GEGENPARTEIEN.freizeit), betrag: -1990, zweck: "Beitrag" },
    { partei: einesVon(GEGENPARTEIEN.mobilitaet), betrag: -6750, zweck: "Fahrt" },
    { partei: einesVon(GEGENPARTEIEN.gesundheit), betrag: -3120, zweck: "Rechnung" },
    { partei: einesVon(GEGENPARTEIEN.anschaffung), betrag: -22400, zweck: "Bestellung" },
    { partei: "Ohlert", betrag: 15900, zweck: "Erstattung" },
  ];
  posteingang.forEach((z, i) => {
    const id = `umsatz-${i + 1}`;
    setzen(
      "INSERT INTO umsatz_roh (id, lauf_id, buchungstag, valuta, betrag, waehrung, gegenpartei, gegenpartei_iban, verwendungszweck, roh_hash) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        "lauf-1",
        tagIn(0, Math.min(stichtag.getDate(), 1 + i)),
        null,
        z.betrag,
        "EUR",
        z.partei,
        iban("99999904", 7000000 + i),
        z.zweck,
        `hash-spielstand-${i + 1}`,
      ],
    );
    setzen(
      "INSERT INTO umsatz_verarbeitung (umsatz_id, zahlungskonto_id, status, geaendert_am) VALUES (?, ?, ?, ?)",
      [id, "konto-giro", "neu", JETZT],
    );
  });
}
