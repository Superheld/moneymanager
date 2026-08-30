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

import { standardkategorienFlach } from "../application/kategorien/standardkategorien";

/** Was der Seed von einer Datenbank braucht — bewusst weniger als sql.js bietet. */
export interface SeedDb {
  run(sql: string, werte?: (string | number | null)[]): unknown;
}

/**
 * Wie viele Monate zurueck der Spielstand reicht.
 *
 * Achtzehn und nicht mehr acht, seit die Alltagszahlungen Belege tragen: erst damit gibt
 * es genug Beispiele, um ein Modell zu trainieren UND es an zurueckgehaltenen Zeilen zu
 * MESSEN (`MESSBAR_AB`). Mit acht Monaten lag der Bestand knapp ueber der Schwelle, und
 * eine Trefferquote aus einer Handvoll Pruefzeilen sagt mehr ueber den Zufall der
 * Aufteilung als ueber das Modell.
 */
export const MONATE = 18;

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
  //
  // **Zwei Bauteile je Name, und beide haben eine Aufgabe.** Der Nachname ist einmalig und
  // damit ein SCHARFES Merkmal — er entscheidet seine Kategorie praktisch allein. Der
  // Zusatz („Sued", „Filiale", „Handel") kommt bewusst in mehreren Bereichen vor und
  // STREUT: er trennt nichts, sieht aber aus wie ein brauchbares Wort.
  //
  // Ohne diese zweite Sorte zeigt der Trainingsbereich nichts. Trennschaerfe und
  // Trennkraft unterscheiden sich erst, wo es beides gibt — ein Spielstand, in dem jedes
  // Wort seine Kategorie eindeutig bestimmt, laesst jede Kennzahl gleich gut aussehen und
  // beantwortet damit keine einzige Frage, fuer die die Zahlen da sind.
  //
  // Und mehrwortig muessen sie sein, weil `merkmalsbefund` bei einem EINwortigen Namen gar
  // kein `emp:`-Token anlegt (es waere eine Kopie des ganzen Namens). Der Spielstand
  // enthielt bis 2026-08-29 ausschliesslich einwortige — die halbe Merkmalsquelle war
  // darin also nie zu sehen.
  const GEGENPARTEIEN = {
    lebensmittel: ["Kesselmann Sued", "Aukamp Filiale", "Rinsche Markt", "Belvo Zentrum", "Talmer Markt"],
    freizeit: ["Trentmoor Studio", "Oemke Zentrum", "Sindler Handel", "Volkart Buehne"],
    mobilitaet: ["Varnhold Station", "Petrell Filiale", "Nordwig Verkehr"],
    gesundheit: ["Lauterbek Praxis", "Norhast Sued", "Ehlbeck Handel"],
    anschaffung: ["Dessloch Handel", "Weimbrand Versand", "Rautgund Sued"],
  };

  /**
   * Der Anlass zur Zahlung — die zweite Haelfte einer Bezeichnung.
   *
   * Er sagt, WOFUER gezahlt wurde, und darf das auch: die Regel aus `src/CLAUDE.md`
   * verlangt sektorneutrale NAMEN, damit aus einem Fantasienamen nicht hervorgeht, was es
   * beim echten Haushalt an Vertraegen gibt. Ein Anlasswort ist kein Name und steht in
   * einem Bestand, der von A bis Z erfunden ist — aus ihm laesst sich nichts ableiten.
   * Ohne ihn liest sich der Auszug wie eine Liste von Nachnamen.
   */
  const ANLAESSE = {
    lebensmittel: ["Wocheneinkauf", "Einkauf", "Nachkauf", "Markttag"],
    freizeit: ["Monatsbeitrag", "Eintritt", "Kursgebuehr"],
    mobilitaet: ["Fahrschein", "Monatskarte", "Tankfuellung"],
    gesundheit: ["Rechnung", "Zuzahlung", "Rezept"],
    anschaffung: ["Bestellung", "Ersatzteil", "Neuanschaffung"],
  };

  /**
   * Was eine Bank sonst noch in den Verwendungszweck schreibt.
   *
   * Ohne diesen Anteil ist der Spielstand zu sauber, um die Filter zu zeigen: die
   * Stoppwortliste haette nichts zu tun, die Ziffernregel nichts zu greifen, und die
   * abgeschnittenen Randziffern — der Fall, an dem das Zuruecknehmen eines Ausschlusses
   * einmal ins Leere lief — kaemen ueberhaupt nicht vor.
   *
   * `Bankkarte2026` ist genau dieser Fall: das Wort traegt eine angeklebte Jahreszahl, das
   * Token heisst `bankkarte`, und in der Liste stehen beide Formen nebeneinander.
   */
  const BANKTEXTE = [
    "",
    "Kartenzahlung Bankkarte2026",
    "SEPA Basislastschrift Mandat",
    "Referenz 88213 Kartenzahlung",
    "Bankkarte2026",
    "Beleg 4711",
  ];

  /**
   * Eine Bezeichnung fuer eine Alltagsbuchung — ERZEUGT, nicht abgeschrieben.
   *
   * Bis 2026-08-25 schrieb der Spielstand ueberhaupt keine `notiz`, und der Auszug zeigte
   * seitenweise Zeilen ohne Beschriftung. Eine feste Liste waere die naheliegende Antwort
   * gewesen und die schlechtere: sie muesste mit jeder neuen Buchungsart mitwachsen, und
   * bei sechs bis zehn Einkaeufen im Monat staende ueberall dasselbe.
   *
   * Gezogen wird aus dem GESAETEN Wuerfel, wie alles hier. Derselbe Aufruf erzeugt damit
   * denselben Bestand — ein Screenshot von gestern zeigt dieselben Zeilen wie einer von
   * heute, Bezeichnungen eingeschlossen.
   */
  const bezeichnung = (bereich: keyof typeof GEGENPARTEIEN): { partei: string; zweck: string } => {
    const banktext = einesVon(BANKTEXTE);
    return {
      partei: einesVon(GEGENPARTEIEN[bereich]),
      zweck: `${einesVon(ANLAESSE[bereich])}${banktext ? ` ${banktext}` : ""}`,
    };
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
    { id: "konto-bar", bezeichnung: "Haushaltskasse", typ: "Bargeld", klasse: "liquide", iban: null, stand: 13740 },
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

  // Zwei Gruppen, und die zweite ist der Fall, den eine feste Klasse nicht abbilden
  // kann: dasselbe Konto liegt in beiden. Genau dafuer gibt es Gruppen NEBEN der Klasse.
  const gruppen = [
    { id: "gruppe-alltag", bezeichnung: "Lebenshaltung", konten: ["konto-giro", "konto-bar"] },
    { id: "gruppe-urlaub", bezeichnung: "Urlaubskasse", konten: ["konto-bar", "konto-tagesgeld"] },
  ];
  for (const g of gruppen) {
    setzen("INSERT INTO kontogruppe (id, bezeichnung) VALUES (?, ?)", [g.id, g.bezeichnung]);
    for (const kontoId of g.konten) {
      setzen("INSERT INTO kontogruppe_konto (gruppe_id, konto_id) VALUES (?, ?)", [g.id, kontoId]);
    }
  }

  // **Die Kategorien kommen aus der VORLAGE, nicht aus einer eigenen Liste.**
  //
  // Bis 2026-08-30 standen hier vierzehn selbst gepflegte Eintraege, und sie hiessen
  // anders als die Vorlage dieselben Dinge nennt: `Mobilitaet` ohne Umlaut, `Miete` statt
  // `Miete & Nebenkosten`, `Energie` statt `Strom & Gas`, `Freizeit` statt `Freizeit & Hobby`.
  // `standardkategorienAnlegen` gleicht ueber den NAMEN ab — sieben der vierzehn fanden
  // keinen Partner, und wer nach einem `npm run seed` in der App auf
  // „Standardkategorien laden" drueckte, bekam sie ein zweites Mal. Zwei Listen fuer
  // dieselbe Sache driften auseinander, und diese beiden haben es getan.
  //
  // Jetzt gibt es nur noch eine Liste. Der Spielstand sieht damit aus wie ein frisch
  // eingerichteter Bestand statt wie ein Sonderfall, und die Vorlage laeuft bei jedem
  // `npm test` durch `seed.test.ts` mit.
  for (const k of standardkategorienFlach()) {
    setzen("INSERT INTO kategorie (id, name, eltern_id, default_charakter) VALUES (?, ?, ?, ?)", [
      k.id,
      k.name,
      k.elternId ?? null,
      k.defaultCharakter,
    ]);
  }

  // ------------------------------------------------------------ Budgets

  // Die Betraege sind eine REIHE mit Geltungsmonat — deshalb bekommt eines davon bewusst
  // zwei Versionen: so zeigt der Spielstand den Fall, fuer den `budget_betrag` ueberhaupt
  // existiert (eine Aenderung schreibt die Vergangenheit nicht um).
  //
  // ZWEI Dinge muessen dabei der Maske genuegen und nicht nur dem Schema — die Spalten
  // sind `TEXT` bzw. nullable, die App ist strenger, und der Unterschied faellt erst beim
  // BEARBEITEN auf:
  //
  // - `start` ist ein DATUM (`YYYY-MM-DD`), kein Monat. Hier stand `monat(...)`, und
  //   damit wies `budgetAnlegen` jedes Speichern mit „Startdatum angeben" ab. Bei einem
  //   monatlichen Budget zeigt die Maske das Startdatum gar nicht an — die Meldung war
  //   also nicht einmal zu befolgen.
  // - Das KONTO ist Pflicht. Hier stand `null`, und der Dialog verlangte eine Deckung,
  //   die der Spielstand nie hatte.
  const budgets = [
    {
      id: "budget-lebensmittel",
      kategorie: "kat-lebensmittel",
      konto: "konto-giro",
      art: "monatlich",
      betraege: [
        { ab: monat(-MONATE), betrag: 45000 },
        { ab: monat(-2), betrag: 52000 },
      ],
    },
    {
      id: "budget-freizeit",
      kategorie: "kat-freizeit-hobby",
      konto: "konto-giro",
      art: "monatlich",
      betraege: [{ ab: monat(-MONATE), betrag: 18000 }],
    },
    {
      // Das Aufbauende liegt auf der Ruecklage und nicht auf dem Giro: was sich ansammelt,
      // soll auch dort liegen, wo es hingehoert.
      id: "budget-anschaffung",
      kategorie: "kat-anschaffungen",
      konto: "konto-tagesgeld",
      art: "aufbauend",
      betraege: [{ ab: monat(-MONATE), betrag: 15000 }],
    },
  ];
  for (const b of budgets) {
    setzen("INSERT INTO budget (id, kategorie_id, konto_id, art, start) VALUES (?, ?, ?, ?, ?)", [
      b.id,
      b.kategorie,
      b.konto,
      b.art,
      tagIn(-MONATE, 1),
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
    { id: "vertrag-internet", anbieter: "Halvern", kategorie: "kat-internet-telefon", betrag: -4500 },
    { id: "vertrag-versicherung", anbieter: "Mordhorst", kategorie: "kat-versicherungen", betrag: -8900 },
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
      [i.id, i.bezeichnung, i.wert, i.monate, tagIn(-MONATE - 12, 10), "kat-anschaffungen", "konto-tagesgeld"],
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
  /**
   * Eine Buchung. Die Zusatzangaben sind optional, weil der Normalfall keine braucht —
   * gebraucht werden sie fuer die Faelle, die der Spielstand ausdruecklich enthalten soll:
   * eine Buchung AUS DEM IMPORT (traegt `rohHash`, ueber den der Beleg wiederfindbar ist),
   * eine noch anzusehende (`zuPruefen`) und die Vertragszuordnung samt ihrer Herkunft.
   */
  const buchung = (
    datum: string,
    betrag: number,
    kontoId: string,
    kategorieId: string | null,
    charakter: string,
    extra: {
      quelle?: string;
      rohHash?: string;
      zuPruefen?: boolean;
      kategorieHerkunft?: string;
      vertragId?: string | null;
      vertragHerkunft?: string | null;
      /**
       * Die Bezeichnung der Zeile. Leer lassen darf sie nur, wer einen BELEG dazu anlegt:
       * dann zeigt der Auszug den Empfaenger von dort. Alles andere stuende sonst ohne
       * Beschriftung in der Liste — und das war bis 2026-08-25 der Normalfall.
       */
      notiz?: string;
    } = {},
  ): string => {
    const id = `buchung-${String(++lfd).padStart(4, "0")}`;
    setzen(
      "INSERT INTO ist_buchung (id, datum, betrag, konto_id, kategorie_id, charakter, quelle, kategorie_herkunft, zu_pruefen, roh_hash, vertrag_id, vertrag_herkunft, notiz) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        datum,
        betrag,
        kontoId,
        kategorieId,
        charakter,
        extra.quelle ?? "manuell",
        extra.kategorieHerkunft ?? "manuell",
        extra.zuPruefen ? 1 : 0,
        extra.rohHash ?? null,
        extra.vertragId ?? null,
        extra.vertragHerkunft ?? null,
        extra.notiz ?? null,
      ],
    );
    return id;
  };

  /**
   * Was aus dem Bankabruf kam und schon verbucht ist. Wird unten zu Belegen gemacht —
   * eine verbuchte Zeile OHNE ihren Beleg gaebe es in der App nicht, und der Weg von der
   * Buchung zum Beleg (`umsatz_verarbeitung.istbuchung_id`) waere im Spielstand nie zu
   * sehen.
   */
  const ausSync: {
    buchungId: string;
    hash: string;
    datum: string;
    betrag: number;
    partei: string;
    zweck: string;
    kontoId: string;
    monatsversatz: number;
  }[] = [];

  /** Die letzten drei Monate kommen aus dem Abruf, alles davor ist Handarbeit. */
  /**
   * Ab welchem Monatsversatz die Zeilen aus dem Abruf stammen — und damit einen BELEG
   * haben.
   *
   * Vorher stand hier 2, also nur die drei juengsten Monate, und das machte den
   * Spielstand fuer die Kategorie-Erkennung unbrauchbar: Empfaenger und Verwendungszweck
   * stehen an `umsatz_roh`, nicht an der Buchung. Alles ohne Beleg faellt im
   * Trainingsmaterial unter „ohne Text" — es blieben eine Handvoll Zeilen mit immer
   * denselben fuenf Empfaengern.
   *
   * Die aeltesten zwei Monate bleiben absichtlich von Hand erfasst: der Fall gehoert in
   * den Bestand, und er ist der Grund, warum „ohne Text" ueberhaupt gezaehlt wird.
   */
  const AUS_ABRUF_AB = MONATE - 2;

  for (let m = MONATE; m >= 0; m--) {
    const gesynct = m <= AUS_ABRUF_AB;
    /** Wiederkehrendes: von Hand erfasst — oder, in den jungen Monaten, aus dem Abruf. */
    const fest = (
      tag: number,
      betrag: number,
      kontoId: string,
      kategorieId: string,
      charakter: string,
      partei: string,
      zweck: string,
      vertragId?: string,
    ) => {
      const datum = tagIn(-m, tag);
      const hash = `hash-sync-${m}-${partei.toLowerCase()}`;
      const id = buchung(datum, betrag, kontoId, kategorieId, charakter, {
        // Dieselben Woerter wie am Beleg. Bei den von Hand erfassten Monaten gibt es
        // keinen, und ohne die Bezeichnung staende die Zeile dort leer da.
        notiz: `${partei} ${zweck}`,
        quelle: gesynct ? "import" : "manuell",
        rohHash: gesynct ? hash : undefined,
        kategorieHerkunft: gesynct ? "automatisch" : "manuell",
        vertragId: vertragId ?? null,
        vertragHerkunft: vertragId ? "automatisch" : null,
      });
      if (gesynct) {
        ausSync.push({ buchungId: id, hash, datum, betrag, partei, zweck, kontoId, monatsversatz: m });
      }
      return id;
    };

    // Wiederkehrendes — das Geruest, an dem der Monatsverlauf haengt
    fest(28, 315000, "konto-giro", "kat-gehalt", "Ertrag", "Auszahlung", "Bezuege");
    fest(1, -98000, "konto-giro", "kat-miete-nebenkosten", "Aufwand", "Steenbeck", "Monatsmiete");
    fest(5, -4500, "konto-giro", "kat-internet-telefon", "Aufwand", "Halvern", "Grundgebuehr", "vertrag-internet");
    fest(15, -8900, "konto-giro", "kat-versicherungen", "Aufwand", "Mordhorst", "Beitrag", "vertrag-versicherung");
    fest(8, -zahlZwischen(6000, 11000), "konto-giro", "kat-energie", "Aufwand", "Wendlandt", "Abschlag");
    // Eine Umschichtung hat ZWEI Seiten — sonst zeigt der Verlauf einen Stand, den es nie gab.
    buchung(tagIn(-m, 2), -30000, "konto-giro", "kat-sparen-anlegen", "Umschichtung", {
      notiz: "Uebertrag zur Ruecklage",
    });
    buchung(tagIn(-m, 2), 30000, "konto-tagesgeld", "kat-sparen-anlegen", "Umschichtung", {
      notiz: "Uebertrag vom Girokonto",
    });

    /**
     * Eine Alltagszahlung — MIT Beleg, sobald der Monat aus dem Abruf stammt.
     *
     * Der Unterschied zu `buchung()` ist genau der: Empfaenger und Verwendungszweck
     * landen ueber `ausSync` in `umsatz_roh`. Vorher trugen diese Zeilen nur eine
     * `notiz`, und `spurenAus` liest die nicht — sie waren im Trainingsmaterial
     * unsichtbar, obwohl sie die grosse Mehrheit des Bestands ausmachen.
     */
    const alltag = (
      bereich: keyof typeof GEGENPARTEIEN,
      tag: number,
      betrag: number,
      kontoId: string,
      kategorieId: string,
    ) => {
      const { partei, zweck } = bezeichnung(bereich);
      const datum = tagIn(-m, tag);
      const hash = `hash-alltag-${m}-${ausSync.length}`;
      const id = buchung(datum, betrag, kontoId, kategorieId, "Aufwand", {
        notiz: `${partei} ${zweck}`,
        quelle: gesynct ? "import" : "manuell",
        rohHash: gesynct ? hash : undefined,
        kategorieHerkunft: gesynct ? "automatisch" : "manuell",
      });
      if (gesynct) {
        ausSync.push({ buchungId: id, hash, datum, betrag, partei, zweck, kontoId, monatsversatz: m });
      }
    };

    // Alltag — streut, damit die Budgets mal passen und mal nicht
    for (let i = 0; i < zahlZwischen(6, 10); i++) {
      alltag(
        "lebensmittel",
        zahlZwischen(2, 27),
        -zahlZwischen(1800, 9500),
        einesVon(["konto-giro", "konto-bar", "konto-kk"]),
        "kat-lebensmittel",
      );
    }
    for (let i = 0; i < zahlZwischen(1, 4); i++) {
      alltag("freizeit", zahlZwischen(3, 26), -zahlZwischen(1200, 7800), "konto-kk", "kat-freizeit-hobby");
    }
    for (let i = 0; i < zahlZwischen(1, 3); i++) {
      alltag("mobilitaet", zahlZwischen(3, 26), -zahlZwischen(900, 5400), "konto-giro", "kat-mobilitaet");
    }
    if (zufall() < 0.45) {
      alltag("gesundheit", zahlZwischen(5, 24), -zahlZwischen(2500, 18000), "konto-giro", "kat-gesundheit");
    }
    if (zufall() < 0.3) {
      alltag("anschaffung", zahlZwischen(5, 24), -zahlZwischen(8000, 42000), "konto-tagesgeld", "kat-anschaffungen");
    }
    // Ein Anbieter, der in ZWEI Kategorien auftaucht — der Fall, an dem sich Trennschaerfe
    // und Trennkraft ueberhaupt erst unterscheiden lassen. Ohne ihn traegt jedes Wort
    // seine Kategorie eindeutig, und beide Kennzahlen saehen ueberall gleich gut aus.
    if (zufall() < 0.5) {
      alltag("lebensmittel", zahlZwischen(4, 25), -zahlZwischen(1500, 6000), "konto-kk", "kat-anschaffungen");
    }
  }

  // Ein Rueckfluss — Aufwand mit POSITIVEM Betrag, in der Kategorie der Ausgabe. Der Fall
  // steht ausdruecklich in der Wurzel-`CLAUDE.md`, und ohne ihn im Spielstand faellt eine
  // Regression daran erst am echten Bestand auf.
  buchung(tagIn(-1, 20), 6400, "konto-giro", "kat-gesundheit", "Aufwand", {
    notiz: `${einesVon(GEGENPARTEIEN.gesundheit)} Erstattung`,
  });
  // Dasselbe eine Ebene groesser: eine Steuerrueckerstattung gehoert zu „Steuern", auch
  // wenn die urspruengliche Zahlung gar nicht im Bestand steht.
  buchung(tagIn(-3, 12), 48500, "konto-giro", "kat-steuern", "Aufwand", {
    notiz: "Rueckerstattung Vorjahr",
  });

  // Eine aufgeteilte Buchung. Summe der Teile MUSS dem Betrag entsprechen — das setzt der
  // Kern voraus, und der Spielstand soll den Fall enthalten, nicht nur den Normalfall.
  const geteilt = buchung(tagIn(-1, 14), -12600, "konto-giro", "kat-lebensmittel", "Aufwand", {
    notiz: `${einesVon(GEGENPARTEIEN.lebensmittel)} Sammelposten`,
  });
  setzen(
    "INSERT INTO ist_buchung_aufteilung (id, istbuchung_id, kategorie_id, betrag, notiz) VALUES (?, ?, ?, ?, ?)",
    ["teil-1", geteilt, "kat-lebensmittel", -8100, null],
  );
  setzen(
    "INSERT INTO ist_buchung_aufteilung (id, istbuchung_id, kategorie_id, betrag, notiz) VALUES (?, ?, ?, ?, ?)",
    ["teil-2", geteilt, "kat-anschaffungen", -4500, null],
  );

  // Drei Buchungen, die noch angesehen werden muessen. `zu_pruefen` setzt die Durchsicht,
  // wenn etwas unklar blieb — ohne ihn im Spielstand bleibt die zugehoerige Ansicht immer
  // leer, und man haelt sie fuer kaputt statt fuer unbefuellt. Eine davon hat gar keine
  // Kategorie: genau der Fall, der zum Pruefen zwingt.
  const pruefBuchungen: Record<string, string> = {
    "hash-pruef-1": buchung(tagIn(0, 3), -8790, "konto-giro", null, "Aufwand", {
      quelle: "import", rohHash: "hash-pruef-1", zuPruefen: true, kategorieHerkunft: "automatisch",
    }),
    "hash-pruef-2": buchung(tagIn(0, 6), -16820, "konto-kk", "kat-anschaffungen", "Aufwand", {
      quelle: "import", rohHash: "hash-pruef-2", zuPruefen: true, kategorieHerkunft: "automatisch",
    }),
    "hash-pruef-3": buchung(tagIn(-1, 24), 9900, "konto-giro", "kat-sonstige-einnahmen", "Ertrag", {
      quelle: "import", rohHash: "hash-pruef-3", zuPruefen: true, kategorieHerkunft: "automatisch",
    }),
  };

  // Der Fall, fuer den `vertrag_herkunft` ueberhaupt existiert: eine Zahlung, die
  // AUSDRUECKLICH zu keinem Vertrag gehoert. `vertrag_id` leer, Herkunft gesetzt — ohne
  // die Herkunft holte der naechste Abgleich sie zurueck, und die Handkorrektur waere
  // jedes Mal aufs Neue zu machen.
  buchung(tagIn(-1, 9), -4500, "konto-giro", "kat-internet-telefon", "Aufwand", {
    notiz: "Einmalige Zusatzleistung",
    vertragId: null, vertragHerkunft: "manuell",
  });

  // ------------------------------------------------------------ Planung

  // Zahlungsregeln tragen den Monatsausblick. Ohne sie zeigt die Uebersicht zwar Ist-Zahlen,
  // aber keine Vorschau — und der halbe Zweck des Bereichs bliebe unsichtbar.
  for (const r of [
    { id: "regel-miete", bez: "Miete", betrag: -98000, rhythmus: "monatlich", tag: 1, kat: "kat-miete-nebenkosten", charakter: "Aufwand", vertrag: null },
    { id: "regel-gehalt", bez: "Bezuege", betrag: 315000, rhythmus: "monatlich", tag: 28, kat: "kat-gehalt", charakter: "Ertrag", vertrag: null },
    { id: "regel-internet", bez: "Internet", betrag: -4500, rhythmus: "monatlich", tag: 5, kat: "kat-internet-telefon", charakter: "Aufwand", vertrag: "vertrag-internet" },
    { id: "regel-versicherung", bez: "Versicherung", betrag: -8900, rhythmus: "monatlich", tag: 15, kat: "kat-versicherungen", charakter: "Aufwand", vertrag: "vertrag-versicherung" },
    // Eine nicht-monatliche, damit die Projektionsarithmetik im Spielstand vorkommt.
    { id: "regel-beitrag", bez: "Jahresbeitrag", betrag: -24000, rhythmus: "jaehrlich", tag: 20, kat: "kat-freizeit-hobby", charakter: "Aufwand", vertrag: null },
  ]) {
    setzen(
      "INSERT INTO zahlungsregel (id, bezeichnung, betrag, rhythmus, startdatum, charakter, konto_id, kategorie_id, vertrag_id) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [r.id, r.bez, r.betrag, r.rhythmus, tagIn(-MONATE, r.tag), r.charakter, "konto-giro", r.kat, r.vertrag],
    );
  }

  // ------------------------------------------------------------ Bankzugang

  // Ein zweiter Zugang, diesmal fuer den Zahlungsverkehr. Er traegt die Zuordnung Bankkonto
  // → unser Konto samt „bis wann schon abgerufen" — daran haengt, dass ein neuer Abruf
  // nicht wieder bei null anfaengt.
  setzen(
    "INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am, art, tan_verfahren_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ["zugang-giro", "Hausbank", "https://example.invalid/fints", "99999901", "spielstand", JETZT, "fints", 942],
  );
  for (const z of [
    { schluessel: "99999901/1002003", konto: "konto-giro", format: "camt" },
    { schluessel: "99999901/1002004", konto: "konto-kk", format: "mt940" },
  ]) {
    setzen(
      "INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id, letzter_abruf_bis, letztes_format, format_wahl) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
      ["zugang-giro", z.schluessel, z.konto, tagIn(0, Math.max(1, stichtag.getDate() - 1)), z.format, "auto"],
    );
  }

  // ------------------------------------------------------------ Import-Laeufe

  // VIER Laeufe aus DREI Quellen, und das ist der Punkt: derselbe Zeitraum kommt einmal
  // als Datei und einmal ueber die Bank herein. Genau daraus entstehen die Zwillinge
  // weiter unten — nicht aus einem doppelten Klick, sondern aus zwei Wegen zum selben Geld.
  const LAUF_FG = "lauf-fg-1";
  const LAUF_SYNC = ["lauf-fints-0", "lauf-fints-1", "lauf-fints-2"]; // Index = Monatsversatz
  /**
   * Der ERSTE Abruf, der die Historie auf einmal geholt hat — alles aelter als die drei
   * monatlichen Laeufe haengt daran.
   *
   * Vorher fiel das ueber `?? LAUF_SYNC[0]` auf den JUENGSTEN Lauf zurueck: eine Zeile von
   * vor einem Jahr stand dann in einem Abruf von diesem Monat. Das ist nicht bloss
   * unsauber, es ist die Frage, die der Import-Verlauf beantworten soll — „was hat dieser
   * Abruf gebracht" — mit einer falschen Antwort.
   */
  const LAUF_ERST = "lauf-fints-erst";
  const LAUF_KK = "lauf-kk-1";

  const laufAnlegen = (
    id: string, quelle: string, zeitpunkt: string, dateiname: string | null,
    konto: string, format: string | null, zugang: string | null,
  ) =>
    setzen(
      "INSERT INTO import_lauf (id, quelle, zeitpunkt, dateiname, eingelesen, neu, duplikate, zugang_id, zahlungskonto_id, format, abgeschnitten) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
      [id, quelle, zeitpunkt, dateiname, 0, 0, 0, zugang, konto, format],
    );

  // Der Dateiimport — eine Ausfuhr aus einer anderen App, ueber denselben Zeitraum.
  laufAnlegen(LAUF_FG, "finanzguru", JETZT, "ausfuhr.xlsx", "konto-giro", null, null);
  // Drei Bankabrufe, einer je jungem Monat, jeder zu seiner Zeit. CAMT, weil die Bank es
  // kann — der Abruf waehlt das reichere Format, wenn er darf.
  LAUF_SYNC.forEach((id, versatz) =>
    laufAnlegen(
      id,
      "fints",
      new Date(stichtag.getFullYear(), stichtag.getMonth() - versatz, 28).toISOString(),
      null,
      "konto-giro",
      "camt",
      "zugang-giro",
    ),
  );
  // Und der Erstabruf, datiert auf den Beginn der Bankanbindung.
  laufAnlegen(
    LAUF_ERST,
    "fints",
    new Date(stichtag.getFullYear(), stichtag.getMonth() - AUS_ABRUF_AB, 28).toISOString(),
    null,
    "konto-giro",
    "camt",
    "zugang-giro",
  );
  // Die Kreditkarte liefert MT940 — dasselbe Haus, anderes Format. Wer `umsatzart` oder
  // `buchungsschluessel` auswertet, muss ueber `lauf_id` danach unterscheiden.
  laufAnlegen(LAUF_KK, "fints", JETZT, null, "konto-kk", "mt940", "zugang-giro");

  // ------------------------------------------------------------ Belege

  let umsatzNr = 0;
  const umsatzAnlegen = (o: {
    laufId: string; kontoId: string; datum: string; betrag: number; partei: string;
    zweck: string; hash: string; status: string; istbuchungId?: string | null;
    vorschlagKategorie?: string | null; vorschlagCharakter?: string | null;
    vorschlagQuelle?: string | null; umsatzart?: string | null; zweckCode?: string | null;
    /** Nur CAMT: wer die Zahlung wirklich bekommt, wenn ein Dienstleister dazwischensteht. */
    endempfaenger?: string | null;
  }): string => {
    const id = `umsatz-${String(++umsatzNr).padStart(3, "0")}`;
    setzen(
      "INSERT INTO umsatz_roh (id, lauf_id, buchungstag, valuta, betrag, waehrung, gegenpartei, gegenpartei_iban, verwendungszweck, roh_hash, umsatzart, zweck_code, endempfaenger) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id, o.laufId, o.datum, o.datum, o.betrag, "EUR", o.partei,
        iban("99999904", 7000000 + umsatzNr), o.zweck, o.hash,
        o.umsatzart ?? null, o.zweckCode ?? null, o.endempfaenger ?? null,
      ],
    );
    setzen(
      "INSERT INTO umsatz_verarbeitung (umsatz_id, zahlungskonto_id, status, istbuchung_id, vorschlag_kategorie_id, vorschlag_charakter, vorschlag_quelle, geaendert_am) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id, o.kontoId, o.status, o.istbuchungId ?? null,
        o.vorschlagKategorie ?? null, o.vorschlagCharakter ?? null, o.vorschlagQuelle ?? null,
        JETZT,
      ],
    );
    return id;
  };

  // Was schon verbucht ist: zu jeder gesyncten Buchung ihr Beleg. Erst damit gibt es den
  // Weg `umsatz_verarbeitung.istbuchung_id` von der Buchung zurueck zum Beleg — und den
  // braucht jede Detailansicht, weil Empfaenger und Verwendungszweck NICHT an der Buchung
  // stehen.
  for (const s of ausSync) {
    umsatzAnlegen({
      laufId: LAUF_SYNC[s.monatsversatz] ?? LAUF_ERST,
      kontoId: s.kontoId,
      datum: s.datum,
      betrag: s.betrag,
      partei: s.partei,
      zweck: s.zweck,
      hash: s.hash,
      status: "verbucht",
      istbuchungId: s.buchungId,
      zweckCode: s.betrag > 0 ? "SALA" : null,
      umsatzart: "Dauerauftrag",
    });
  }

  // Die drei noch anzusehenden Buchungen haben ebenfalls Belege — sonst haetten sie einen
  // Pruefmerker, aber nichts, woran man sie pruefen koennte.
  const zuPruefen = [
    { hash: "hash-pruef-1", datum: tagIn(0, 3), betrag: -8790, partei: "Kolbeck", zweck: "Abbuchung ohne klaren Bezug", konto: "konto-giro" },
    { hash: "hash-pruef-2", datum: tagIn(0, 6), betrag: -16820, partei: "Dessloch", zweck: "Bestellung", konto: "konto-kk" },
    { hash: "hash-pruef-3", datum: tagIn(-1, 24), betrag: 9900, partei: "Ohlert", zweck: "Gutschrift", konto: "konto-giro" },
  ];
  for (const p of zuPruefen) {
    umsatzAnlegen({
      laufId: p.konto === "konto-kk" ? LAUF_KK : LAUF_SYNC[0],
      kontoId: p.konto, datum: p.datum, betrag: p.betrag, partei: p.partei,
      zweck: p.zweck, hash: p.hash, status: "verbucht",
      istbuchungId: pruefBuchungen[p.hash],
    });
  }

  // ------------------------------------------------------------ Sonderfaelle
  //
  // Faelle, die sich nur an echten Daten zeigten und deren Fehlen im Spielstand jedes Mal
  // bedeutete, dass man zum Pruefen an den echten Bestand musste. Genau das soll nicht
  // noetig sein: was hier steht, kann jeder nachvollziehen, der das Repo klont.

  // (1) Ein Umbuchungs-Bein OHNE Gegenstueck.
  //
  // Der Beleg ist als Umbuchung markiert, aber das Gegenkonto liegt nicht im Bestand —
  // Geld auf ein Konto ausserhalb des Moneymanagers. Es wird deshalb NICHT als
  // Umschichtung gebucht, sondern nach seiner Richtung (Abfluss -> Aufwand), und bleibt
  // ohne Kategorie in der Nacharbeit.
  //
  // Bis 2026-08-29 entstand hier eine einseitige Umschichtung, die in kein Budget und in
  // keine Ausgabe zaehlte: das Geld war weg und fehlte nirgends.
  const halbeUmbuchung = buchung(tagIn(-1, 9), -25000, "konto-giro", null, "Aufwand", {
    quelle: "import",
    rohHash: "hash-halbe-umbuchung",
    kategorieHerkunft: "automatisch",
  });
  umsatzAnlegen({
    laufId: LAUF_SYNC[1] ?? LAUF_SYNC[0],
    kontoId: "konto-giro",
    datum: tagIn(-1, 9),
    betrag: -25000,
    partei: "Uebertrag Depotkonto",
    zweck: "Uebertrag",
    hash: "hash-halbe-umbuchung",
    status: "verbucht",
    istbuchungId: halbeUmbuchung,
    umsatzart: "Uebertrag",
  });

  // (2) Ein Zahlungsdienstleister zwischen Konto und Haendler.
  //
  // `gegenpartei` nennt den Dienstleister, `endempfaenger` den Haendler dahinter — zwei
  // verschiedene Angaben, und die zweite liefert nur CAMT. Fuer die Kategorie-Erkennung
  // ist der Unterschied erheblich: der Dienstleister ist bei JEDEM Haendler derselbe und
  // taugt deshalb als Merkmal nichts.
  //
  // Der Spielstand traegt das Feld, damit sichtbar ist, dass es importiert und (Stand
  // heute) von niemandem ausgewertet wird.
  const ueberDienstleister = buchung(tagIn(0, 11), -3990, "konto-giro", "kat-freizeit-hobby", "Aufwand", {
    quelle: "import",
    rohHash: "hash-dienstleister",
    kategorieHerkunft: "automatisch",
  });
  umsatzAnlegen({
    laufId: LAUF_SYNC[0],
    kontoId: "konto-giro", datum: tagIn(0, 11), betrag: -3990,
    partei: "Zahlungsdienst Norderwiek", zweck: "Bestellung 4471", hash: "hash-dienstleister",
    status: "verbucht", istbuchungId: ueberDienstleister,
    endempfaenger: "Bierbaum Versand", zweckCode: "OTHR",
  });

  // ------------------------------------------------------------ Posteingang

  // Offene Zeilen mit VERSCHIEDEN begruendeten Vorschlaegen. Die Quelle des Vorschlags ist
  // in der Durchsicht sichtbar, und sie soll dort nicht immer dieselbe sein: ein Treffer
  // ueber die Erkennungsregel eines Vertrags wiegt anders als einer des Modells.
  const posteingang = [
    { partei: einesVon(GEGENPARTEIEN.lebensmittel), betrag: -4230, zweck: "Einkauf", kat: "kat-lebensmittel", quelle: "ki" },
    { partei: einesVon(GEGENPARTEIEN.freizeit), betrag: -1990, zweck: "Monatsbeitrag", kat: "kat-freizeit-hobby", quelle: "ki" },
    { partei: "Wendlandt", betrag: -7350, zweck: "Abschlag", kat: "kat-energie", quelle: "regel" },
    { partei: einesVon(GEGENPARTEIEN.mobilitaet), betrag: -6750, zweck: "Fahrschein", kat: "kat-mobilitaet", quelle: "regel" },
    { partei: einesVon(GEGENPARTEIEN.gesundheit), betrag: -3120, zweck: "Rechnung", kat: "kat-gesundheit", quelle: "ki" },
    // Ohne Vorschlag: die Automatik hat sich nicht getraut, und das ist eine ehrliche
    // Auskunft. Der Spielstand soll auch den Fall zeigen, in dem nichts vorgeschlagen wird.
    { partei: "Rautenkranz", betrag: -11850, zweck: "Uebertrag Vertragskonto", kat: null, quelle: null },
    { partei: "Ohlert", betrag: 15900, zweck: "Erstattung Vorjahr", kat: "kat-gesundheit", quelle: "ki" },
  ];
  posteingang.forEach((z, i) => {
    umsatzAnlegen({
      laufId: LAUF_SYNC[0],
      kontoId: "konto-giro",
      datum: tagIn(0, Math.max(1, Math.min(stichtag.getDate(), 2 + i))),
      betrag: z.betrag,
      partei: z.partei,
      zweck: z.zweck,
      hash: `hash-offen-${i + 1}`,
      status: "neu",
      vorschlagKategorie: z.kat,
      vorschlagCharakter: z.kat ? (z.betrag > 0 ? "Ertrag" : "Aufwand") : null,
      vorschlagQuelle: z.quelle,
    });
  });

  // Zwei Zeilen der Kreditkarte, MT940 — anderes Konto, anderes Format, gleiche Durchsicht.
  [
    { partei: einesVon(GEGENPARTEIEN.freizeit), betrag: -4990, zweck: "Kartenzahlung" },
    { partei: einesVon(GEGENPARTEIEN.anschaffung), betrag: -8640, zweck: "Kartenzahlung" },
  ].forEach((z, i) => {
    umsatzAnlegen({
      laufId: LAUF_KK, kontoId: "konto-kk",
      datum: tagIn(0, Math.max(1, Math.min(stichtag.getDate(), 3 + i))),
      betrag: z.betrag, partei: z.partei, zweck: z.zweck,
      hash: `hash-kk-${i + 1}`, status: "neu",
      umsatzart: "015", // MT940: numerisch. Bei CAMT stuende hier Freitext.
    });
  });

  // ------------------------------------------------------------ Zwillinge

  // Der Dublettenverdacht wird beim HINSEHEN gerechnet, nicht an die Zeile geschrieben
  // (`dubletten/dublettensicht.ts`). Deshalb reicht es NICHT, einen Verdacht zu setzen —
  // es muessen echte Zwillinge im Bestand liegen: gleicher Betrag, gleicher Empfaenger,
  // Datum um einen Tag versetzt, aus zwei Quellen. Den Rest rechnet die App selbst.

  // Paar A — die Datei bringt etwas, das ueber die Bank schon VERBUCHT ist. Das ist der
  // Ledger-Verdacht: dieselbe Zahlung stuende zweimal im Saldo.
  const dubA = buchung(tagIn(-1, 17), -6480, "konto-giro", "kat-lebensmittel", "Aufwand", {
    quelle: "import", rohHash: "hash-dub-a1", kategorieHerkunft: "automatisch",
  });
  umsatzAnlegen({
    laufId: LAUF_SYNC[1], kontoId: "konto-giro", datum: tagIn(-1, 17), betrag: -6480,
    partei: "Aukamp", zweck: "Einkauf", hash: "hash-dub-a1", status: "verbucht", istbuchungId: dubA,
  });
  umsatzAnlegen({
    laufId: LAUF_FG, kontoId: "konto-giro", datum: tagIn(-1, 18), betrag: -6480,
    partei: "Aukamp", zweck: "Einkauf", hash: "hash-dub-a2", status: "neu",
    vorschlagKategorie: "kat-lebensmittel", vorschlagCharakter: "Aufwand", vorschlagQuelle: "ki",
  });

  // Paar B — beide noch offen, aus zwei Quellen. Das ist der Stapel-Verdacht: beim
  // Durchsehen faellt auf, dass dieselbe Zahlung zweimal im Eingang liegt.
  umsatzAnlegen({
    laufId: LAUF_SYNC[0], kontoId: "konto-giro", datum: tagIn(0, Math.max(1, stichtag.getDate() - 2)),
    betrag: -3390, partei: "Rinsche", zweck: "Einkauf", hash: "hash-dub-b1", status: "neu",
    vorschlagKategorie: "kat-lebensmittel", vorschlagCharakter: "Aufwand", vorschlagQuelle: "ki",
  });
  umsatzAnlegen({
    laufId: LAUF_FG, kontoId: "konto-giro", datum: tagIn(0, Math.max(1, stichtag.getDate() - 1)),
    betrag: -3390, partei: "Rinsche", zweck: "Einkauf", hash: "hash-dub-b2", status: "neu",
    vorschlagKategorie: "kat-lebensmittel", vorschlagCharakter: "Aufwand", vorschlagQuelle: "ki",
  });

  // Paar C — sieht aus wie eine Dublette, ist aber KEINE: zweimal derselbe Betrag beim
  // selben Empfaenger an aufeinanderfolgenden Tagen. Aus den Daten allein nicht zu
  // entscheiden, aus dem Kopf dessen, der eingekauft hat, schon. Die Entscheidung steht
  // deshalb als Freigabe fest — sonst stuende die Mahnung morgen wieder da.
  const freiA = umsatzAnlegen({
    laufId: LAUF_SYNC[0], kontoId: "konto-giro", datum: tagIn(-1, 6), betrag: -2450,
    partei: "Belvo", zweck: "Einkauf", hash: "hash-frei-1", status: "neu",
    vorschlagKategorie: "kat-lebensmittel", vorschlagCharakter: "Aufwand", vorschlagQuelle: "ki",
  });
  const freiB = umsatzAnlegen({
    laufId: LAUF_SYNC[0], kontoId: "konto-giro", datum: tagIn(-1, 7), betrag: -2450,
    partei: "Belvo", zweck: "Einkauf", hash: "hash-frei-2", status: "neu",
    vorschlagKategorie: "kat-lebensmittel", vorschlagCharakter: "Aufwand", vorschlagQuelle: "ki",
  });
  // Das PAAR wird festgehalten, nicht die Zeile: dass A nicht dasselbe ist wie B, sagt
  // nichts darueber, ob A vielleicht dasselbe ist wie C. Aufsteigend sortiert.
  const [freiKlein, freiGross] = [freiA, freiB].sort();
  setzen("INSERT INTO dubletten_freigabe (umsatz_a, umsatz_b, angelegt) VALUES (?, ?, ?)", [
    freiKlein,
    freiGross,
    JETZT,
  ]);

  // ------------------------------------------------------------ Weggelegtes

  // Verworfen und als Dublette weggelegt — beide bleiben SICHTBAR. Der Import legt jede
  // Zeile an, auch die, die niemand haben wollte; das ist die Vollstaendigkeit, die die
  // Wurzel-`CLAUDE.md` unter GoBD auffuehrt. Und beim Durchsehen zaehlt Weggelegtes mit:
  // „das habe ich schon einmal weggelegt" ist genau die Auskunft, die man dann braucht.
  umsatzAnlegen({
    laufId: LAUF_FG, kontoId: "konto-giro", datum: tagIn(-2, 11), betrag: -1290,
    partei: "Trentmoor", zweck: "Probemonat", hash: "hash-verworfen-1", status: "verworfen",
  });
  umsatzAnlegen({
    laufId: LAUF_FG, kontoId: "konto-giro", datum: tagIn(-1, 1), betrag: -98000,
    partei: "Steenbeck", zweck: "Monatsmiete", hash: "hash-dublette-1", status: "duplikat",
  });
}
