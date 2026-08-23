// Schema-Migrationen — reine Daten, ohne Abhängigkeit zu Tauri/IO, damit die Kette
// isoliert (gegen ein In-Memory-SQLite) getestet werden kann. db.ts wendet sie an;
// die Reihenfolge ist die Wahrheit, Versionen sind streng aufsteigend und vorwärts.

export interface Migration {
  version: number;
  sql: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1, // P0 — Walking Skeleton
    sql: [
      `CREATE TABLE IF NOT EXISTS zahlungsregel (
        id          TEXT PRIMARY KEY,
        bezeichnung TEXT    NOT NULL,
        betrag      INTEGER NOT NULL,
        rhythmus    TEXT    NOT NULL,
        startdatum  TEXT    NOT NULL,
        charakter   TEXT    NOT NULL
      )`,
    ],
  },
  {
    version: 2, // P1 — Stammdaten
    sql: [
      `CREATE TABLE IF NOT EXISTS person (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        geburtsdatum TEXT,
        rolle        TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS zahlungskonto (
        id          TEXT PRIMARY KEY,
        bezeichnung TEXT NOT NULL,
        typ         TEXT NOT NULL,
        iban        TEXT,
        inhaber_ids TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE TABLE IF NOT EXISTS kategorie (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        eltern_id         TEXT,
        default_charakter TEXT NOT NULL
      )`,
      `ALTER TABLE zahlungsregel ADD COLUMN konto_id TEXT`,
      `ALTER TABLE zahlungsregel ADD COLUMN kategorie_id TEXT`,
    ],
  },
  {
    version: 3, // P2.1 — Verträge
    sql: [
      `CREATE TABLE IF NOT EXISTS vertrag (
        id                     TEXT PRIMARY KEY,
        anbieter               TEXT NOT NULL,
        vertragsnummer         TEXT,
        inhaber_id             TEXT,
        beginn                 TEXT NOT NULL,
        mindestlaufzeit_monate INTEGER,
        verlaengerung          TEXT NOT NULL,
        verlaengerung_monate   INTEGER,
        kuendigungsfrist_monate INTEGER,
        status                 TEXT NOT NULL,
        notizen                TEXT
      )`,
      `ALTER TABLE zahlungsregel ADD COLUMN vertrag_id TEXT`,
    ],
  },
  {
    version: 4, // P2.2 — Budgets
    sql: [
      `CREATE TABLE IF NOT EXISTS budget (
        id           TEXT PRIMARY KEY,
        kategorie_id TEXT    NOT NULL,
        rahmen       INTEGER NOT NULL,
        periode      TEXT    NOT NULL
      )`,
    ],
  },
  {
    version: 5, // P2.3 — Töpfe
    sql: [
      `CREATE TABLE IF NOT EXISTS topf (
        id                   TEXT PRIMARY KEY,
        typ                  TEXT NOT NULL,
        bezeichnung          TEXT NOT NULL,
        start                TEXT NOT NULL,
        kategorie_id         TEXT,
        wiederbeschaffung    INTEGER,
        nutzungsdauer_monate INTEGER,
        schaetzbetrag        INTEGER,
        frist_monate         INTEGER,
        zufuehrung_pro_monat INTEGER,
        sparziel             INTEGER
      )`,
    ],
  },
  {
    version: 6, // P2.5 — Inventar
    sql: [
      `CREATE TABLE IF NOT EXISTS inventargegenstand (
        id                   TEXT PRIMARY KEY,
        bezeichnung          TEXT    NOT NULL,
        wiederbeschaffung    INTEGER NOT NULL,
        nutzungsdauer_monate INTEGER NOT NULL,
        anschaffung          TEXT    NOT NULL,
        kategorie_id         TEXT
      )`,
      `ALTER TABLE topf ADD COLUMN inventar_id TEXT`,
    ],
  },
  {
    version: 7, // P2.6 — Szenario (What-if), getrennt vom Plan
    sql: [
      `CREATE TABLE IF NOT EXISTS szenario (
        id   TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS szenario_posten (
        id          TEXT PRIMARY KEY,
        szenario_id TEXT    NOT NULL,
        bezeichnung TEXT    NOT NULL,
        betrag      INTEGER NOT NULL,
        rhythmus    TEXT    NOT NULL,
        startdatum  TEXT    NOT NULL,
        charakter   TEXT    NOT NULL
      )`,
    ],
  },
  {
    version: 8, // Konten: manueller Kontostand
    sql: [`ALTER TABLE zahlungskonto ADD COLUMN kontostand INTEGER NOT NULL DEFAULT 0`],
  },
  {
    version: 9, // P3 — Ist light (ADR-0002): app-seitiges Ist-Journal hinter dem Ledger-Port
    sql: [
      `CREATE TABLE IF NOT EXISTS ist_buchung (
        id               TEXT PRIMARY KEY,
        datum            TEXT    NOT NULL,
        betrag           INTEGER NOT NULL,
        konto_id         TEXT    NOT NULL,
        kategorie_id     TEXT,
        charakter        TEXT    NOT NULL,
        quelle           TEXT    NOT NULL,
        plan_quelle_id   TEXT,
        plan_faelligkeit TEXT,
        roh_hash         TEXT
      )`,
      // 1:1-Matching/Dedup: pro (Plan-Quelle, Fälligkeit) höchstens eine Ist-Buchung.
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_ist_planref
        ON ist_buchung (plan_quelle_id, plan_faelligkeit)
        WHERE plan_quelle_id IS NOT NULL`,
    ],
  },
  {
    version: 10, // Konto-Register: Freitext-Notiz für manuelle Buchungen
    sql: [`ALTER TABLE ist_buchung ADD COLUMN notiz TEXT`],
  },
  {
    version: 11, // Umbuchen: zwei verknüpfte Beine (transferId) + Gegenkonto
    sql: [
      `ALTER TABLE ist_buchung ADD COLUMN transfer_id TEXT`,
      `ALTER TABLE ist_buchung ADD COLUMN gegenkonto_id TEXT`,
    ],
  },
  {
    version: 12, // ADR-0004 — Haushalts-Einstellungen (Währung, Locale, Sprache) als Key/Value
    sql: [
      `CREATE TABLE IF NOT EXISTS einstellung (
        schluessel TEXT PRIMARY KEY,
        wert       TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 13, // ADR-0003 — Verwendung: explizit benanntes Gegenkonto (Topf) an der Ist-Buchung
    sql: [`ALTER TABLE ist_buchung ADD COLUMN verwendung_topf_id TEXT`],
  },
  {
    version: 14, // Import (TAKTIK-IMPORT): Import-Lauf + Umsatz-Entwurfsstapel mit Dedup
    sql: [
      `CREATE TABLE IF NOT EXISTS import_lauf (
        id         TEXT PRIMARY KEY,
        quelle     TEXT    NOT NULL,
        zeitpunkt  TEXT    NOT NULL,
        dateiname  TEXT,
        eingelesen INTEGER NOT NULL DEFAULT 0,
        neu        INTEGER NOT NULL DEFAULT 0,
        duplikate  INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS umsatz (
        id                     TEXT    PRIMARY KEY,
        lauf_id                TEXT    NOT NULL,
        zahlungskonto_id       TEXT    NOT NULL,
        buchungstag            TEXT    NOT NULL,
        valuta                 TEXT,
        betrag                 INTEGER NOT NULL,
        waehrung               TEXT    NOT NULL,
        gegenpartei            TEXT    NOT NULL,
        verwendungszweck       TEXT    NOT NULL,
        roh_hash               TEXT    NOT NULL,
        native_id              TEXT,
        status                 TEXT    NOT NULL,
        vorschlag_kategorie_id TEXT,
        vorschlag_charakter    TEXT,
        vorschlag_quelle       TEXT,
        istbuchung_id          TEXT
      )`,
      // Schnelle Duplikaterkennung über beide gewählten Schlüssel.
      `CREATE INDEX IF NOT EXISTS ix_umsatz_roh_hash ON umsatz (roh_hash)`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_native_id ON umsatz (native_id) WHERE native_id IS NOT NULL`,
    ],
  },
  {
    version: 15, // S-7 — Buchung splitten: Teilbeträge je Kategorie an der Ist-Buchung
    sql: [
      // Value Objects im Aggregat IstBuchung: keine eigene fachliche Identität, Lebenszeit
      // an die Buchung gekoppelt. Die Zeilen-Id trägt nur die Persistenz.
      //
      // Kein Datenumbau — reines Anlegen. Das ist hier wichtig, weil nicht verifiziert
      // ist, ob BEGIN/COMMIT über tauri-plugin-sql auf derselben Connection landen: bei
      // einem Teilabbruch bleibt höchstens die Tabelle ohne Versionseintrag stehen, und
      // der nächste Lauf legt sie per IF NOT EXISTS folgenlos erneut an.
      `CREATE TABLE IF NOT EXISTS ist_buchung_aufteilung (
        id            TEXT    PRIMARY KEY,
        istbuchung_id TEXT    NOT NULL,
        kategorie_id  TEXT    NOT NULL,
        betrag        INTEGER NOT NULL,
        notiz         TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS ix_aufteilung_buchung ON ist_buchung_aufteilung (istbuchung_id)`,
    ],
  },
  {
    version: 16, // Gläubiger-ID am Umsatz — Schlüssel für Vertragserkennung und Regel-Schicht
    sql: [
      // Finanzguru liefert sie („Glaeubiger-ID"), RohUmsatz trug sie, der Umsatz nicht:
      // beim Übernehmen ging sie verloren. Eine SEPA-Mandatsreferenz identifiziert einen
      // Zahlungsempfänger eindeutig — anders als ein abgeschnittener, normalisierter Name.
      `ALTER TABLE umsatz ADD COLUMN glaeubiger_id TEXT`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_glaeubiger ON umsatz (glaeubiger_id) WHERE glaeubiger_id IS NOT NULL`,
    ],
  },
  {
    version: 17, // Inventar rein kalkulatorisch: Konto, auf dem die Rücklage tatsächlich liegt
    sql: [
      // Der Ersatz-Topf ist entfallen; was zurückgelegt ist, wird nicht mehr gebucht,
      // sondern gegen den realen Stand DIESES Kontos abgeglichen (siehe core/inventar.ts).
      // Reines Anlegen einer Spalte, kein Datenumbau — wiederholbar (migrate() überspringt
      // vorhandene Spalten per PRAGMA table_info).
      `ALTER TABLE inventargegenstand ADD COLUMN konto_id TEXT`,
    ],
  },
  {
    version: 18, // Alpha-Aufräumen: leere Hüllen von Szenario und Ersatz-Topf abräumen
    sql: [
      // ALPHA (siehe CLAUDE.md): Die App ist nicht veröffentlicht, es gibt keine fremden
      // Datenbestände zu schonen. Deshalb wird hier ausnahmsweise WEGGENOMMEN statt nur
      // angehängt — sonst schleppte das Schema auf Dauer Tabellen mit, die kein Code mehr
      // kennt, und der nächste Blick ins Schema fragte sich, wofür sie stehen.
      //
      // Der Rest der Regel gilt unverändert: append-only (Migration 18 ist neu, 1–17
      // bleiben unberührt), forward-only, und jedes Statement WIEDERHOLBAR — `IF EXISTS`
      // bei den Tabellen, und `DROP COLUMN` überspringt migrate(), wenn die Spalte fehlt.
      //
      // Kein Datenumbau: alle drei Ziele waren beim Umbau am 2026-08-16 nachweislich leer
      // (szenario 0 Zeilen, szenario_posten 0, topf 0). Es geht nichts verloren.

      // Szenarien — der What-if-Layer ist mit dem Bereich Planung entfallen.
      `DROP TABLE IF EXISTS szenario_posten`,
      `DROP TABLE IF EXISTS szenario`,

      // Ersatz-Topf — das Inventar rechnet seine Rücklage selbst (core/inventar.ts).
      // Damit sind diese drei Spalten an `topf` ohne Bedeutung; TopfTyp kennt nur noch
      // puffer und spartopf.
      `ALTER TABLE topf DROP COLUMN wiederbeschaffung`,
      `ALTER TABLE topf DROP COLUMN nutzungsdauer_monate`,
      `ALTER TABLE topf DROP COLUMN inventar_id`,
    ],
  },
  {
    version: 19, // Vertrag ↔ Ist-Buchung: Erkennungsregel je Vertrag, Zuordnung je Buchung
    sql: [
      // Bis hierher zeigte der Vertrag auf KEINE Buchung; die Zugehörigkeit wurde jedes
      // Mal aus dem Empfängernamen abgeleitet (core/vertragErkennung#anbieterSchluessel).
      // Zwei Tabellen statt Spalten am Vertrag, weil es zwei verschiedene Dinge sind:
      // die REGEL (wie erkenne ich die Zahlungen dieses Vertrags — änderbar, einsehbar)
      // und das ERGEBNIS je Buchung (samt Herkunft, damit Handarbeit den Abgleich
      // überlebt). Dasselbe Muster wie Vertrag ↔ Zahlungsregel: getrennte Kontexte,
      // verknüpft über vertragId.
      //
      // Reines Anlegen, kein Datenumbau — wiederholbar.
      `CREATE TABLE IF NOT EXISTS vertrag_erkennung (
        vertrag_id  TEXT    PRIMARY KEY,
        schluessel  TEXT    NOT NULL,
        betrag_von  INTEGER,
        betrag_bis  INTEGER,
        gueltig_ab  TEXT,
        gueltig_bis TEXT,
        konto_id    TEXT
      )`,
      // `vertrag_id` NULL ist hier eine AUSSAGE („gehört ausdrücklich zu keinem Vertrag"),
      // kein fehlender Wert — nur so überlebt eine Korrektur den nächsten Abgleich.
      // Deshalb auch kein NOT NULL. herkunft: 'automatisch' | 'manuell'.
      `CREATE TABLE IF NOT EXISTS vertrag_zuordnung (
        istbuchung_id TEXT PRIMARY KEY,
        vertrag_id    TEXT,
        herkunft      TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_vertrag_zuordnung_vertrag ON vertrag_zuordnung (vertrag_id)`,
    ],
  },
  {
    version: 20, // Herkunft der KATEGORIE an der Ist-Buchung (Fundament der Auto-Kategorisierung)
    sql: [
      // `quelle` sagt, woher die BUCHUNG kommt (import/manuell/bezahlt-markiert) — nicht,
      // woher ihre KATEGORIE kommt. Solange das fehlt, kann ein automatischer Lauf nicht
      // unterscheiden, ob er einen eigenen früheren Treffer korrigiert oder eine
      // Handentscheidung plattmacht. Dasselbe Problem war bei Vertrag ↔ Buchung schon
      // gelöst (vertrag_zuordnung.herkunft, Migration 19); hier fehlte es.
      //
      // DEFAULT 'automatisch' ist für den Bestand fachlich richtig: er stammt aus einem
      // Import und wurde über das Finanzguru-Remapping kategorisiert, nicht von Hand.
      // Damit greift ein späterer Abgleich auf allem, was nie jemand angefasst hat —
      // und lässt genau das in Ruhe, was jemand angefasst hat.
      //
      // Reines Anlegen mit Default, kein Datenumbau — wiederholbar (`migrate()`
      // überspringt einen Zugang, dessen Spalte schon existiert).
      `ALTER TABLE ist_buchung ADD COLUMN kategorie_herkunft TEXT NOT NULL DEFAULT 'automatisch'`,
    ],
  },
  {
    version: 21, // Klassifikator: das trainierte Modell der automatischen Kategorisierung
    sql: [
      // EINE Zeile, feste Id — es gibt genau ein aktuelles Modell, und ein Training
      // ersetzt es vollständig. Keine Historie: ein altes Modell ist nicht „auch eine
      // Meinung", sondern ein überholter Stand, und aus dem Bestand jederzeit in
      // Millisekunden neu herstellbar.
      //
      // Vokabular und Kategorien als Textliste, die Gewichte als base64-kodierte
      // Float32-Matrix. Kein eigenes Zahlenformat, keine Zeile je Gewicht: bei ~2000
      // Merkmalen × ~50 Kategorien wären das 100.000 Zeilen für einen Wert, den ohnehin
      // niemand einzeln liest.
      `CREATE TABLE IF NOT EXISTS klassifikator_modell (
        id             TEXT    PRIMARY KEY,
        kategorien     TEXT    NOT NULL,
        vokabular      TEXT    NOT NULL,
        gewichte       TEXT    NOT NULL,
        bias           TEXT    NOT NULL,
        beispiele      INTEGER NOT NULL,
        trainiert_am   TEXT    NOT NULL,
        genauigkeit    REAL
      )`,
    ],
  },
  {
    version: 22, // Merkmale steuerbar: welche Wörter nicht ins Training gehen
    sql: [
      // Eine Zeile je ausgeschlossenem Wort. `herkuenfte` NULL heißt „überall", sonst
      // kommagetrennte Herkünfte (empGanz, empWort, vwz, gid, vz) — dasselbe Wort kann
      // im Empfängerfeld brauchbar und im Verwendungszweck Rauschen sein.
      //
      // Die aktiven Herkünfte selbst stehen NICHT hier, sondern in `einstellung`: das
      // sind fünf Schalter, genau der Fall, für den die Key/Value-Tabelle da ist. Eine
      // eigene Tabelle für fünf Zeilen mit festen Schlüsseln wäre Schema ohne Gegenwert.
      //
      // `quelle` hält fest, ob ein Eintrag mitgeliefert wurde oder von Hand kam. Ohne das
      // ließe sich die eigene Pflege nicht von der Grundausstattung trennen — und ein
      // späteres Nachliefern neuer Standardwörter könnte eigene Entscheidungen
      // überschreiben, ohne dass es auffiele.
      `CREATE TABLE IF NOT EXISTS merkmal_ausschluss (
        wort       TEXT PRIMARY KEY,
        herkuenfte TEXT,
        quelle     TEXT NOT NULL DEFAULT 'standard'
      )`,
    ],
  },
  {
    version: 23, // Der Vertrag trägt eine Kategorie — Kopf der Kategorisierungs-Kette
    sql: [
      // Bisher hing die Kategorie nur an der abgeleiteten Zahlungsregel. Für die
      // automatische Kategorisierung ist das die falsche Stelle: was eine Buchung trifft,
      // ist die Vertragszuordnung (Migration 19), und die zeigt auf den VERTRAG. Über die
      // Zahlungsregel zu gehen hieße, sich auf eine Ableitung zu verlassen, die es nicht
      // für jeden Vertrag gibt.
      //
      // Die Zahlungsregel behält ihre eigene Kategorie: sie kann auch ohne Vertrag
      // existieren (freie Planung). Beim Ableiten wird sie aus dem Vertrag vorbelegt.
      `ALTER TABLE vertrag ADD COLUMN kategorie_id TEXT`,
      // Bestandsverträge holen ihre Kategorie aus der abgeleiteten Zahlungsregel nach.
      // Ohne das trüge kein einziger vorhandener Vertrag eine Kategorie, und die
      // Kategorisierungs-Kette begänne erst beim nächsten neu erfassten zu wirken.
      //
      // WIEDERHOLBAR trotz UPDATE (siehe Invarianten): `WHERE kategorie_id IS NULL`
      // greift nach dem ersten Lauf nur noch dort, wo auch die Regel nichts hatte — und
      // schreibt dann wieder NULL. Ein zweiter Durchgang ändert also nichts. Bewusst
      // setzt es NUR leere Felder: eine am Vertrag gepflegte Kategorie darf eine
      // wiederholte Migration nicht überschreiben.
      `UPDATE vertrag SET kategorie_id = (
         SELECT r.kategorie_id FROM zahlungsregel r
          WHERE r.vertrag_id = vertrag.id AND r.kategorie_id IS NOT NULL
          LIMIT 1
       ) WHERE kategorie_id IS NULL`,
    ],
  },
  {
    version: 24, // Kategorie-Festlegungen: das dünne Overlay über der Erkennung
    sql: [
      // Empfängermuster → Kategorie, sonst nichts. Bewusst KEINE Betragsspanne und kein
      // Zeitraum wie bei der Vertragserkennung: die trifft Identität und muss eng sein,
      // eine Kategorie ist eine Klasse (Lebensmittel kosten mal 8 € und mal 190 €).
      //
      // Das Muster ist der Primärschlüssel. Zwei Festlegungen auf denselben Text wären
      // keine zwei Aussagen, sondern eine geänderte — und ein zweites Festlegen soll die
      // erste ersetzen, nicht danebenliegen.
      `CREATE TABLE IF NOT EXISTS kategorie_festlegung (
        muster       TEXT PRIMARY KEY,
        kategorie_id TEXT NOT NULL,
        angelegt_am  TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 25, // Vertrags-Kategorie NOCHMAL nachtragen — v23 hat es nicht überall getan
    sql: [
      // Auf der echten Datenbank stand nach v23 bei allen 16 Verträgen `kategorie_id`
      // auf NULL, obwohl jeder eine Zahlungsregel MIT Kategorie hatte. Die Erklärung ist
      // der Entwicklungsbetrieb: die laufende App hat Version 23 verbucht, als die
      // Migration erst aus dem `ALTER TABLE` bestand — der Nachtrag kam Minuten später
      // dazu und wurde nie ausgeführt, weil die Version schon stand.
      //
      // Die Regel „append-only, bestehende Versionen nie editieren" ist deshalb keine
      // Förmlichkeit: sie ist der Grund, warum die Reparatur hier steht und nicht in v23.
      //
      // Folge ohne diesen Nachtrag: die Vertragsstufe der Kategorisierungs-Kette wäre auf
      // dem echten Bestand weitgehend tot — ein guter Teil der geprüften Zahlungen fiel
      // durch auf das Modell, obwohl für sie eine getroffene Zuordnung existiert.
      //
      // Wiederholbar wie in v23: `WHERE kategorie_id IS NULL` greift nach dem ersten Lauf
      // nur noch dort, wo auch die Regel nichts hat, und schreibt wieder NULL.
      `UPDATE vertrag SET kategorie_id = (
         SELECT r.kategorie_id FROM zahlungsregel r
          WHERE r.vertrag_id = vertrag.id AND r.kategorie_id IS NOT NULL
          LIMIT 1
       ) WHERE kategorie_id IS NULL`,
    ],
  },
  {
    version: 26, // Bankzugang für den FinTS-Direktabruf
    sql: [
      // Ein hinterlegter Zugang — OHNE PIN. Die PIN lebt nur in der Sitzung und wird
      // weder hier noch sonstwo gespeichert; sie steht bei jeder Anmeldung neu im
      // Eingabefeld. Käme sie eines Tages doch in eine Aufbewahrung, dann in den
      // System-Schlüsselbund und nicht in diese Datei.
      //
      // `bankparameter` ist das serialisierte BankingInformation-Objekt der Bibliothek
      // (systemId + BPD + UPD). Es MUSS aufbewahrt werden: ohne es synchronisiert jede
      // Anmeldung von vorn — zwei zusätzliche Dialogrunden, und der Erstlauf zieht dabei
      // eher eine TAN. Es enthält Kontonummern und Inhabernamen, also nichts, was nicht
      // ohnehin in dieser Datenbank steht.
      `CREATE TABLE IF NOT EXISTS bankzugang (
        id               TEXT PRIMARY KEY,
        bezeichnung      TEXT NOT NULL,
        url              TEXT NOT NULL,
        blz              TEXT NOT NULL,
        benutzer         TEXT NOT NULL,
        kunden_id        TEXT,
        bankparameter    TEXT,
        tan_verfahren_id INTEGER,
        tan_medium       TEXT,
        angelegt_am      TEXT NOT NULL
      )`,
      // Welches Bankkonto auf welches Zahlungskonto der App zeigt.
      //
      // Der Schlüssel ist `kontonummer|unterkontomerkmal`, NIE die Kontonummer allein:
      // ein Institut meldet Girokonto und Depot unter derselben Nummer und trennt sie über
      // das Unterkontomerkmal, in dem der Produktname steht.
      //
      // `letzter_abruf_bis` trägt den fortlaufenden Abruf (S-6d): ab wo beim nächsten Mal
      // gelesen wird, statt jedes Mal alles zu holen.
      `CREATE TABLE IF NOT EXISTS bankkonto_zuordnung (
        zugang_id         TEXT NOT NULL,
        schluessel        TEXT NOT NULL,
        zahlungskonto_id  TEXT NOT NULL,
        letzter_abruf_bis TEXT,
        PRIMARY KEY (zugang_id, schluessel)
      )`,
    ],
  },
  {
    version: 27, // Was die Quellen mehr wissen, als bisher ankam
    sql: [
      // Von der BANK wird alles weggespeichert, was strukturiert ankommt — es kostet
      // nichts und fehlt sonst genau dann, wenn man es braucht. Bei der Datei wird
      // gewählt: `Mandatsreferenz` und `Analyse-Umsatzart` tragen, der Rest ist
      // Finanzgurus eigene Auswertung und gehört nicht in unseren Bestand.
      //
      // Der Anlass ist der Dublettenfinder: Gläubiger-ID PLUS Mandatsreferenz ist der
      // einzige von der Bank vergebene Schlüssel, den beide Quellen tragen — und die
      // Mandatsreferenz haben wir bisher weggeworfen, obwohl sie in einem nennenswerten
      // Teil der Zeilen steht.
      `ALTER TABLE umsatz ADD COLUMN gegenpartei_iban TEXT`,
      `ALTER TABLE umsatz ADD COLUMN mandatsreferenz TEXT`,
      `ALTER TABLE umsatz ADD COLUMN e2e_referenz TEXT`,
      `ALTER TABLE umsatz ADD COLUMN umsatzart TEXT`,
      `ALTER TABLE umsatz ADD COLUMN buchungsschluessel TEXT`,
      // Institutseigene Referenz aus dem Freitext (etwa `Ref. …`). Ausdrücklich
      // KEIN Schlüssel — im Spike waren von 64 nur 59 verschieden. Gespeichert wird sie,
      // damit sich am Bestand prüfen lässt, ob sie über mehrere Abrufe stabil bleibt.
      `ALTER TABLE umsatz ADD COLUMN bank_referenz TEXT`,
    ],
  },
  {
    version: 28, // Dublettenverdacht an der Buchung
    sql: [
      // Der Dublettenfinder kennt drei Urteile. „identisch" legt nichts an, sondern
      // ergänzt die vorhandene Zeile; „verschieden" legt an. Dazwischen liegt der
      // Verdacht: die Zeile wird angelegt UND zeigt auf den vermuteten Zwilling, damit
      // die Durchsicht entscheidet statt der Automatik.
      //
      // Warum als eigene Version und nicht in v27 hineingeschrieben, die aus derselben
      // Stunde stammt: die App lief währenddessen. Eine laufende App kann eine Version
      // verbuchen, bevor alle Statements drinstehen — dann liefe der Nachtrag NIE
      // (passiert bei v23, siehe v25). Append-only ist deshalb keine Förmlichkeit.
      `ALTER TABLE umsatz ADD COLUMN verdacht_auf_id TEXT`,
      `ALTER TABLE umsatz ADD COLUMN verdacht_gruende TEXT`,
    ],
  },
  {
    version: 29, // Der Kontostand, den die BANK meldet
    sql: [
      // Bis hierher rechnet die App ihren Kontostand allein aus dem, was sie kennt:
      // Anfangsbestand plus die Buchungen, die es hereingeschafft haben. Fehlt eine,
      // stimmt die Zahl trotzdem — sie ist ja in sich schluessig. Genau das ist das
      // Problem: es gab keine zweite, unabhaengige Aussage, gegen die sich das pruefen
      // liesse. Eine verworfene Bankzeile fiel deshalb erst Wochen spaeter auf.
      //
      // FinTS liefert den echten Saldo (HKSAL), und der Adapter kann ihn laengst — er
      // wurde bisher nur beim Anlegen eines Kontos benutzt. Ab jetzt wird er bei jedem
      // Abruf mitgeholt und hier abgelegt, mit dem Stichtag der Bank. Die Differenz
      // daraus ist die Garantie: null heisst beweisbar synchron, alles andere ist eine
      // Ansage, dass etwas fehlt oder doppelt ist.
      //
      // An der Zuordnung und nicht am Zahlungskonto: es ist die Aussage der BANK ueber
      // ein verknuepftes Konto, kein Stammdatum der App. Offline-Konten haben so etwas
      // schlicht nicht.
      `ALTER TABLE bankkonto_zuordnung ADD COLUMN bank_saldo INTEGER`,
      `ALTER TABLE bankkonto_zuordnung ADD COLUMN bank_saldo_datum TEXT`,
    ],
  },
  {
    version: 30, // Budgets: zwei Arten in EINEM Aggregat — die neuen Spalten und der Umbau
    sql: [
      // Bis hierher gab es drei Arten in zwei Tabellen: `budget` (Rahmen je Periode
      // monatlich/jährlich) und `topf` (Puffer mit Schätzbetrag+Frist, Spartopf mit
      // Zuführung+Sparziel). Alle drei beantworten dieselbe Frage — „was lege ich
      // monatlich für X zurück?" — und unterscheiden sich nur darin, ob der Rest zum
      // Monatsersten verfällt. Genau das bleibt übrig: `art` = monatlich | aufbauend.
      //
      // Neu ist die Konto-Bindung: ein aufbauendes Budget ohne Konto ist eine Zahl ohne
      // Deckung. Bestandsbudgets bekommen unten das Konto, über das am meisten gebucht
      // wurde — eine Vorbelegung, keine Aussage; sie ist in der Maske änderbar.
      `ALTER TABLE budget ADD COLUMN konto_id TEXT`,
      `ALTER TABLE budget ADD COLUMN betrag_pro_monat INTEGER`,
      `ALTER TABLE budget ADD COLUMN art TEXT`,
      `ALTER TABLE budget ADD COLUMN start TEXT`,

      // Datenumbau, deshalb streng wiederholbar formuliert: jedes UPDATE trifft nur
      // Zeilen, die den Wert noch NICHT tragen. Ein zweiter Lauf ändert nichts mehr.
      // (Migrationen laufen ohne Transaktion — siehe CLAUDE.md „Invarianten".)
      `UPDATE budget SET betrag_pro_monat = CASE periode WHEN 'jaehrlich' THEN CAST(ROUND(rahmen / 12.0) AS INTEGER) ELSE rahmen END WHERE betrag_pro_monat IS NULL`,
      `UPDATE budget SET art = 'monatlich' WHERE art IS NULL`,
      // Fester Stichtag statt „heute": eine Migration muss bei jedem Lauf dasselbe tun.
      `UPDATE budget SET start = '2026-08-01' WHERE start IS NULL`,
      // Das meistgenutzte Konto, nicht das alphabetisch erste: „Depot" stand sonst vor
      // „Girokonto" und hätte jedem Haushaltsbudget das falsche Konto verpasst.
      // Die ID als zweites Sortierkriterium hält das Ergebnis bei Gleichstand stabil.
      `UPDATE budget SET konto_id = (SELECT konto_id FROM ist_buchung GROUP BY konto_id ORDER BY COUNT(*) DESC, konto_id LIMIT 1) WHERE konto_id IS NULL`,
      // Rückfall für eine Datenbank ohne Buchungen: irgendein Girokonto, sonst irgendeins.
      `UPDATE budget SET konto_id = (SELECT id FROM zahlungskonto WHERE typ = 'Giro' ORDER BY bezeichnung LIMIT 1) WHERE konto_id IS NULL`,
      `UPDATE budget SET konto_id = (SELECT id FROM zahlungskonto ORDER BY bezeichnung LIMIT 1) WHERE konto_id IS NULL`,
    ],
  },
  {
    version: 31, // … und erst danach abräumen
    sql: [
      // Warum getrennt von v30 und nicht in einer Version: v30 LIEST `periode` und
      // `rahmen`. Stünde das Abräumen daneben und bräche der Lauf dazwischen ab, liefe
      // v30 beim nächsten Start erneut — dann gegen eine Tabelle, der die gelesenen
      // Spalten fehlen. SQLite prüft die Spaltennamen beim Parsen, das `WHERE … IS NULL`
      // rettet nichts, und die App käme nicht mehr hoch. Als eigene Version ist v30
      // abgeschlossen, bevor v31 ihm die Grundlage entzieht.
      `ALTER TABLE budget DROP COLUMN rahmen`,
      `ALTER TABLE budget DROP COLUMN periode`,

      // ALPHA (siehe CLAUDE.md): weggenommen wird nur, was nachweislich leer ist. Geprüft
      // am 2026-08-19 gegen den echten Bestand: `topf` trug 8 Zeilen, alle vom Typ
      // „ersatz" — Altbestand, den `alle()` seit v18 herausfiltert, für den Code also
      // längst nicht mehr existent. Lebende Töpfe (puffer/spartopf): 0. Ist-Buchungen mit
      // `verwendung_topf_id`: 0. Es geht nichts verloren.
      `DROP TABLE IF EXISTS topf`,
      // Die „Verwendung" (ADR-0003, explizit benanntes Gegenkonto) hatte genau einen
      // Fall — die Topf-Entnahme. Ohne Töpfe ist die Spalte ein leeres Konzept.
      `ALTER TABLE ist_buchung DROP COLUMN verwendung_topf_id`,
    ],
  },
  {
    version: 32, // Nicht jeder Vertrag ist ein Abo
    sql: [
      // Arbeitsvertrag, Mietvertrag, Kindergeld: wiederkehrende Zahlungen mit Fristen,
      // aber niemand sucht dort die nächste Gelegenheit auszusteigen. Bis hierher bekam
      // ein Arbeitsvertrag ohne Mindestlaufzeit dieselbe Behandlung wie ein Abo
      // („heute kündbar, bald!") und stand in der Warnung, die den kündbaren Verträgen
      // gehört. Bestand bleibt „abo" — das war die bisherige Annahme, und sie stimmt
      // für die Mehrheit.
      `ALTER TABLE vertrag ADD COLUMN art TEXT NOT NULL DEFAULT 'abo'`,
    ],
  },
  {
    version: 33, // Verwaiste Umsätze: „verbucht", aber die Buchung gibt es nicht mehr
    sql: [
      // Wer eine Buchung über die Sammelbearbeitung entfernte, liess ihren Umsatz auf
      // „verbucht" stehen — mit einer istbuchung_id, die ins Leere zeigte. Das ist ein
      // Widerspruch in den Daten, und er wurde sichtbar, als die Dublettenprüfung in den
      // Auszug wanderte: sie mahnte Zeilen an, die längst entfernt waren.
      //
      // Der Zielzustand ist derselbe, den der reparierte Use-Case ab jetzt herstellt:
      // `verworfen` ohne Buchungsbezug. Nicht `neu` — diese Zeilen wurden bewusst
      // weggeworfen, sie gehören nicht zurück in den Stapel. In der Datenbank bleiben
      // sie: „das habe ich schon einmal weggeworfen" ist die Auskunft, die der nächste
      // Import braucht (`bestandsSchluessel` liest sie unabhängig vom Status).
      //
      // Wiederholbar: nach dem ersten Lauf trifft die WHERE-Bedingung nichts mehr.
      `UPDATE umsatz
          SET status = 'verworfen', istbuchung_id = NULL
        WHERE status = 'verbucht'
          AND (istbuchung_id IS NULL
               OR istbuchung_id NOT IN (SELECT id FROM ist_buchung))`,
    ],
  },
  {
    version: 34, // „Kein Duplikat" — die Entscheidung von Hand braucht einen Platz
    sql: [
      // Die Dublettenprüfung läuft bei JEDEM Hinsehen neu. Ohne diese Tabelle käme
      // dieselbe Fehleinschätzung nach jedem Neuladen wieder, und die einzige Abhilfe
      // wäre, eine der beiden richtigen Buchungen zu löschen.
      //
      // Gespeichert wird das PAAR, nicht die Buchung: dass A nicht dasselbe ist wie B,
      // sagt nichts darüber, ob A dasselbe ist wie C. Die beiden Spalten sind aufsteigend
      // sortiert, damit der Primärschlüssel in beide Richtungen greift — sortiert wird im
      // Use-Case, die Datenbank kann das nicht erzwingen.
      //
      // Kein FOREIGN KEY: verschwindet ein Umsatz, steht hier eine Zeile ohne Wirkung,
      // und die ist harmloser als ein Löschweg, der an einer Freigabe scheitert.
      `CREATE TABLE IF NOT EXISTS dubletten_freigabe (
         umsatz_a TEXT NOT NULL,
         umsatz_b TEXT NOT NULL,
         angelegt TEXT NOT NULL,
         PRIMARY KEY (umsatz_a, umsatz_b)
       )`,
    ],
  },
  {
    version: 35, // Kontostands-Anker: was an einem Stichtag wirklich da war
    sql: [
      // Bisher stand der von der Bank gemeldete Saldo an der Kontozuordnung und wurde bei
      // JEDEM Abruf überschrieben. Damit ist die Frage „stimmt mein Konto?" mit einer Zahl
      // zu beantworten, die Frage „seit wann nicht mehr?" mit gar nichts — und die zweite
      // ist die nützlichere: aus einer mehrjährigen Historie werden zwei Wochen.
      //
      // Ein Anker ist eine BEOBACHTUNG, kein Rechenergebnis. Er wird deshalb nie ungültig
      // und braucht keine Invalidierung, wenn jemand nachträglich eine Buchung davor
      // einfügt — was sich ändert, ist die Differenz, und genau die will man sehen.
      //
      // Zwei Herkünfte: 'bank' (gemeldet) und 'hand' (Kassensturz beim Bargeld). Deshalb
      // im Schlüssel: an einem Tag kann beides vorkommen.
      `CREATE TABLE IF NOT EXISTS kontostand_anker (
         konto_id   TEXT    NOT NULL,
         datum      TEXT    NOT NULL,
         herkunft   TEXT    NOT NULL,
         betrag     INTEGER NOT NULL,
         erfasst_am TEXT    NOT NULL,
         PRIMARY KEY (konto_id, datum, herkunft)
       )`,
      // Der zuletzt gemeldete Stand wird zum ersten Anker — sonst begänne die Historie
      // bei null und die erste brauchbare Aussage käme erst nach dem übernächsten Abruf.
      // `INSERT OR IGNORE` macht das Statement wiederholbar.
      `INSERT OR IGNORE INTO kontostand_anker (konto_id, datum, herkunft, betrag, erfasst_am)
       SELECT zahlungskonto_id, bank_saldo_datum, 'bank', bank_saldo, bank_saldo_datum
         FROM bankkonto_zuordnung
        WHERE bank_saldo IS NOT NULL AND bank_saldo_datum IS NOT NULL`,
    ],
  },
  {
    version: 36, // … und erst danach die alten Spalten abräumen
    sql: [
      // Getrennte Version, weil v35 sie LIEST. Stünde beides zusammen und der Lauf bräche
      // dazwischen ab, liefe v35 beim nächsten Start gegen die fehlenden Spalten — SQLite
      // prüft Spaltennamen beim Parsen, da rettet keine WHERE-Bedingung.
      `ALTER TABLE bankkonto_zuordnung DROP COLUMN bank_saldo`,
      `ALTER TABLE bankkonto_zuordnung DROP COLUMN bank_saldo_datum`,
    ],
  },
  {
    version: 37, // Bankfähigkeitsprofil — was die Bank kann, aufbewahrt statt weggeworfen
    sql: [
      // Die Bank meldet bei jedem Dialog mit, was sie kann: wie weit sie Umsätze vorhält,
      // welche Formate sie kennt, welche TAN-Verfahren es gibt, was sie je Konto freigibt.
      // Das steckte bisher im `bankparameter`-Blob der Bibliothek, aus dem wir genau einen
      // Wert holten und den Rest verwarfen — und der Blob ist für die Anwendungsschicht
      // nicht lesbar. Hier steht dasselbe in unseren eigenen Begriffen, als JSON.
      //
      // Als Spalte und nicht als Tabelle, weil das Profil immer als Ganzes gelesen wird
      // und nie Gegenstand einer Abfrage ist. Wird es das, ist die Tabelle eine spätere
      // Migration und kein verlorener Aufwand.
      `ALTER TABLE bankzugang ADD COLUMN profil TEXT`,
      // Welches Umsatzformat für dieses Konto zuletzt getragen hat. Wir fragen CAMT zuerst
      // und fallen auf MT940 zurück; wo der Rückfall schon einmal nötig war, spart der
      // Vermerk beim nächsten Mal eine ergebnislose Runde zur Bank.
      `ALTER TABLE bankkonto_zuordnung ADD COLUMN letztes_format TEXT`,
    ],
  },
  {
    version: 38, // Depots — Beobachtungen statt Buchungen
    sql: [
      // Ein Depot ist ausdrücklich KEIN `zahlungskonto`. Ein Zahlungskonto hat einen
      // Anfangsbestand und Buchungen, aus denen sich sein Stand ergibt; ändert sich der
      // Stand, ist etwas geflossen. Ein Depot hat einen Wert, der sich täglich ändert,
      // ohne dass etwas passiert wäre — er ist nicht liquide, belastet kein Budget und
      // gehört in keine Liquiditätsprojektion.
      //
      // Der Unterschied ist nicht theoretisch: `liquideMittel()` summiert die Salden ALLER
      // Konten ohne Typprüfung. Ein Depot dort einzureihen hiesse, es an jeder künftigen
      // Auswertung wieder ausnehmen zu müssen — und einmal wird es vergessen.
      `CREATE TABLE IF NOT EXISTS depot (
         id          TEXT PRIMARY KEY,
         zugang_id   TEXT NOT NULL,
         schluessel  TEXT NOT NULL,
         bezeichnung TEXT NOT NULL,
         waehrung    TEXT,
         UNIQUE (zugang_id, schluessel)
       )`,
      // Die Wertreihe. Ein Eintrag je Stichtag, nicht ein überschriebener Wert: die Frage
      // „wie hat es sich entwickelt" ist die einzige, die ein Depot überhaupt beantworten
      // kann, und sie braucht die Geschichte.
      `CREATE TABLE IF NOT EXISTS depotwert (
         depot_id    TEXT    NOT NULL,
         stichtag    TEXT    NOT NULL,
         gesamtwert  INTEGER NOT NULL,
         erfasst_am  TEXT    NOT NULL,
         PRIMARY KEY (depot_id, stichtag)
       )`,
      // Die Positionen zum Stichtag. `stueck`, `kurs` und `einstand_kurs` stehen bewusst
      // als REAL da und nicht als INTEGER: das eine ist eine Menge (Fondsanteile haben
      // Nachkommastellen), die anderen sind Notierungen der Bank mit oft vier
      // Nachkommastellen. In Cent gepresst verlören sie still an Genauigkeit. `wert` ist
      // dagegen Geld und damit Integer Cent wie überall sonst; gerechnet wird nur damit.
      //
      // `kennung` ist der Schlüssel innerhalb eines Stichtags: ISIN, sonst WKN, sonst
      // Name, sonst die laufende Nummer. Nicht (isin, name) als zusammengesetzter
      // Schlüssel — in SQLite gelten NULL-Werte innerhalb eines Primärschlüssels
      // paarweise als VERSCHIEDEN, zwei Positionen ohne beides landeten also doppelt in
      // der Tabelle, und zwar bei jedem Abruf erneut.
      `CREATE TABLE IF NOT EXISTS depotposition (
         depot_id       TEXT NOT NULL,
         stichtag       TEXT NOT NULL,
         kennung        TEXT NOT NULL,
         isin           TEXT,
         wkn            TEXT,
         name           TEXT,
         stueck         REAL,
         kurs           REAL,
         wert           INTEGER,
         waehrung       TEXT,
         einstand_datum TEXT,
         einstand_kurs  REAL,
         PRIMARY KEY (depot_id, stichtag, kennung)
       )`,
    ],
  },
  {
    version: 39, // Reparatur von v38 — `depotposition` neu, mit `kennung`
    sql: [
      // v38 legte die Tabelle zunächst mit `PRIMARY KEY (depot_id, stichtag, isin, name)`
      // an. Das ist falsch: in SQLite gelten NULL-Werte innerhalb eines Primärschlüssels
      // paarweise als VERSCHIEDEN, zwei Positionen ohne ISIN und ohne Namen landeten also
      // bei jedem Abruf erneut in der Tabelle.
      //
      // Der Fehler wurde in v38 SELBST korrigiert, statt eine neue Version anzuhängen —
      // gegen die Regel oben in dieser Datei. Wo v38 zu dem Zeitpunkt schon gelaufen war,
      // wurde sie als erledigt vermerkt und die Korrektur nie ausgeführt; der erste
      // Depotabruf scheiterte dort mit „table depotposition has no column named kennung".
      // Genau dafür gibt es die Regel: eine Reparatur ist eine NEUE Version.
      //
      // Neu anlegen statt ALTER, weil SQLite den Primärschlüssel nicht ändern kann. Der
      // Verlust ist keiner: die Tabelle hält Beobachtungen eines Stichtags, und der
      // nächste Abruf schreibt sie vollständig neu. Beide Ausgangslagen enden hier
      // gleich — die mit und die ohne `kennung`.
      `DROP TABLE IF EXISTS depotposition`,
      `CREATE TABLE IF NOT EXISTS depotposition (
         depot_id       TEXT NOT NULL,
         stichtag       TEXT NOT NULL,
         kennung        TEXT NOT NULL,
         isin           TEXT,
         wkn            TEXT,
         name           TEXT,
         stueck         REAL,
         kurs           REAL,
         wert           INTEGER,
         waehrung       TEXT,
         einstand_datum TEXT,
         einstand_kurs  REAL,
         PRIMARY KEY (depot_id, stichtag, kennung)
       )`,
    ],
  },
  {
    version: 40, // Kontoklasse — wofür ein Konto da ist, und ob sein Geld verfügbar ist
    sql: [
      // Der Kontotyp sagt, WAS ein Konto ist (Giro, Tagesgeld). Die Klasse sagt, welche
      // Rolle es spielt — und daraus folgt, ob sein Geld zu den liquiden Mitteln zählt.
      // Zwei Fragen, die sich nicht decken: dasselbe Tagesgeldkonto kann Alltagsreserve
      // oder zweckgebundene Rücklage sein, ohne dass sich sein Typ ändert.
      //
      // Bis hierher summierte `liquideMittel()` alle Salden ohne Unterschied, und ein
      // Depot zählte als Bargeld.
      `ALTER TABLE zahlungskonto ADD COLUMN klasse TEXT`,
      // Vorbelegung aus dem Typ — nur ein Vorschlag, überschreibbar in der Oberfläche.
      // Ein Depot ist offensichtlich nicht verfügbar; bei allem anderen ist „verfügbar"
      // die harmlosere Annahme, weil sie den bisherigen Stand fortschreibt.
      //
      // `WHERE klasse IS NULL` statt einer Scheintransaktion: so ist das Statement
      // wiederholbar, und ein zweiter Lauf überschreibt keine Wahl des Nutzers.
      `UPDATE zahlungskonto SET klasse = 'vorsorge' WHERE klasse IS NULL AND typ = 'Depot'`,
      `UPDATE zahlungskonto SET klasse = 'liquide'  WHERE klasse IS NULL`,
    ],
  },
  {
    version: 41, // Prüfmarker — „das hier sollte ich mir ansehen"
    sql: [
      // „Neu" ist keine Eigenschaft der Buchung, sondern eine Beziehung zwischen ihr und
      // dem Nutzer: noch nicht angeschaut. Die Herkunft steht längst da (`umsatz.laufId`
      // → `import_lauf`, mit Zeitpunkt und Quelle) und beantwortet die Frage nicht — sie
      // sagt, woher die Zeile kam, nicht ob jemand sie gesehen hat.
      //
      // Ein Zeitstempel „zuletzt gesehen" in `einstellung` wäre billiger gewesen, kann
      // aber nur ALLES auf einmal abräumen. Gebraucht wird beides einzeln: eine Zeile
      // wegklicken, und eine andere von Hand zum Prüfen vormerken. Das geht nur an der
      // Buchung.
      //
      // Kein DEFAULT 1: was schon im Bestand liegt, ist angesehen. Sonst trüge nach der
      // Migration jede Zeile den Marker, und ein Merker, der überall steht, sagt nichts.
      `ALTER TABLE ist_buchung ADD COLUMN zu_pruefen INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    version: 42, // Ein Lauf weiss, WOHER er kam — Zugang, Konto und Format
    sql: [
      // Bisher stand der Zusammenhang nur im `dateiname`, als Fliesstext nach dem Muster
      // „<Bank> · <Konto> · <von> bis <bis>". Lesbar für Menschen, unbrauchbar für alles
      // andere — wer die Läufe EINES Zugangs oder EINES Kontos sehen will, müsste den Text
      // zerlegen und bei jeder Umbenennung neu raten.
      //
      // Der Bezug wird bewusst NICHT über die Umsätze hergeleitet. Das ginge für Läufe
      // mit Ergebnis, aber gerade die interessanten haben oft keines: von den bisherigen
      // Abrufen brachte die Mehrzahl keine einzige neue Zeile, weil der Rückgriff
      // dieselben Tage nochmal holt. Genau diese Läufe fielen aus jeder Auswertung
      // heraus — „was habe ich wann abgefragt" bliebe unbeantwortbar.
      `ALTER TABLE import_lauf ADD COLUMN zugang_id TEXT`,
      `ALTER TABLE import_lauf ADD COLUMN zahlungskonto_id TEXT`,
      // Welches Umsatzformat getragen hat („CAMT" oder „MT940"). Die Frage „warum kamen
      // bei diesem Abruf nur 500 Zeilen" ist ohne diese Angabe nicht zu beantworten: die
      // beiden Formate haben verschiedene Grenzen, und welches lief, wusste hinterher
      // niemand mehr.
      `ALTER TABLE import_lauf ADD COLUMN format TEXT`,
      // Was die Bank an Zeilen hergab, bevor die Dublettenprüfung darüberlief. `eingelesen`
      // zählt schon dasselbe — aber nur, solange niemand die Bedeutung verschiebt. Diese
      // Spalte hält fest, ob der Abruf an eine ANZAHLGRENZE gestossen ist: ein Lauf, der
      // bei genau 500 endet, sieht sonst aus wie ein vollständiger.
      `ALTER TABLE import_lauf ADD COLUMN abgeschnitten INTEGER NOT NULL DEFAULT 0`,
      //
      // Für den BESTAND wird nichts geraten. Die vorhandenen Läufe tragen ihren Zugang im
      // Dateinamen, und ein Parser darüber wäre genau die Textraterei, die diese Migration
      // abschafft. Sie bleiben ohne Bezug; die Ansichten müssen das ohnehin aushalten,
      // weil auch künftig Dateiimporte ohne Zugang entstehen.
    ],
  },
  {
    version: 43, // Umsatzformat je Konto WÄHLBAR, nicht nur gelernt
    sql: [
      // `letztes_format` daneben ist ein GEDÄCHTNIS: es dreht die Reihenfolge der beiden
      // Versuche um, damit die absehbar vergebliche erste Runde entfällt. Es schliesst
      // nichts aus — der zweite Versuch bleibt, und ein Institut, das CAMT nachrüstet,
      // kommt von selbst wieder darauf.
      //
      // Diese Spalte ist eine FESTLEGUNG. Sie wird gebraucht, weil das Gedächtnis genau
      // dann nicht greift, wenn man es am nötigsten hätte: liefert der erste Versuch
      // etwas — und sei es eine von der Bank gedeckelte Teilmenge —, gilt er als
      // erfolgreich und der zweite läuft nie. Wer den anderen Weg sehen will, muss den
      // ersten ausschliessen können.
      //
      // Am KONTO und nicht am Zugang: dieselbe Bank kann sich je Konto unterschiedlich
      // verhalten, und eine Festlegung, die alle Konten mitzieht, ist beim Nachjustieren
      // im Weg. Leer heisst „automatisch" — das bisherige Verhalten.
      `ALTER TABLE bankkonto_zuordnung ADD COLUMN format_wahl TEXT`,
    ],
  },
  {
    version: 44, // Der Beleg und was wir daraus gemacht haben — zwei Tabellen statt einer
    sql: [
      // WARUM DAS AUSEINANDERGEHT. `umsatz` trug dreierlei in einer Zeile: die Rohdaten,
      // wie die Quelle sie lieferte; die Zuordnung zu Lauf und Konto; und den Zustand
      // unserer Verarbeitung (Status, erzeugte Buchung, Kategorievorschlag). Das erste
      // darf sich nie ändern, das letzte ändert sich bei jeder Durchsicht — in einer
      // Tabelle ist beides nur durch Disziplin getrennt, und Disziplin hält keinen
      // Randfall aus.
      //
      // Es ist NICHT die Kardinalität, die hier trennt: 1:1 gehörte nach Lehrbuch in eine
      // Tabelle. Es ist der Lebenszyklus. Die Probe darauf ist „auf den Stand der Quelle
      // zurücksetzen": das wird jetzt ein DELETE auf einer Tabelle, und die Rohzeile hat
      // es nie gemerkt.
      `CREATE TABLE IF NOT EXISTS umsatz_roh (
         id                 TEXT    PRIMARY KEY,
         lauf_id            TEXT    NOT NULL REFERENCES import_lauf(id),
         format             TEXT,
         buchungstag        TEXT    NOT NULL,
         valuta             TEXT,
         betrag             INTEGER NOT NULL,
         waehrung           TEXT    NOT NULL,
         gegenpartei        TEXT    NOT NULL,
         gegenpartei_iban   TEXT,
         verwendungszweck   TEXT    NOT NULL,
         glaeubiger_id      TEXT,
         mandatsreferenz    TEXT,
         e2e_referenz       TEXT,
         umsatzart          TEXT,
         buchungsschluessel TEXT,
         bank_referenz      TEXT,
         roh_hash           TEXT    NOT NULL,
         native_id          TEXT
       )`,

      // `istbuchung_id` trägt bewusst KEIN ON DELETE CASCADE: verschwindet eine Buchung,
      // soll die Importzeile bleiben und wieder verbuchbar werden — nicht mitsterben.
      // SET NULL allein reicht dafür nicht, der Status müsste mit; das erledigt der
      // Anwendungscode beim Verwerfen. Der FK verhindert hier vor allem den stummen
      // Widerspruch „verbucht, aber es gibt nichts".
      // `zahlungskonto_id` steht hier und NICHT beim Beleg, obwohl man es zuerst dort
      // sucht. Die Quelle liefert eine IBAN oder Kontonummer — das ist Beleg. WELCHES
      // unserer Konten damit gemeint ist, ist unsere Zuordnung: bei einer Datei entsteht
      // sie über den Konto-Match, und beim Verbuchen lässt der Dialog sie ändern. Etwas,
      // das der Mensch korrigieren darf, ist kein Beleg.
      `CREATE TABLE IF NOT EXISTS umsatz_verarbeitung (
         umsatz_id              TEXT PRIMARY KEY REFERENCES umsatz_roh(id) ON DELETE CASCADE,
         zahlungskonto_id       TEXT NOT NULL REFERENCES zahlungskonto(id),
         status                 TEXT NOT NULL,
         istbuchung_id          TEXT REFERENCES ist_buchung(id) ON DELETE SET NULL,
         vorschlag_kategorie_id TEXT,
         vorschlag_charakter    TEXT,
         vorschlag_quelle       TEXT,
         verdacht_auf_id        TEXT,
         verdacht_gruende       TEXT,
         geaendert_am           TEXT NOT NULL
       )`,

      // WIDERSPRUCH AUFLÖSEN, BEVOR DER FK IHN VERBIETET. Im Bestand stehen Zeilen auf
      // „verbucht", deren Buchung es nicht mehr gibt — der Zustand, den `herkunftsicht`
      // heute aufdeckt und der beim Löschen importierter Zeilen entstand. Mit dem FK
      // scheiterte das Kopieren daran.
      //
      // Sie werden NICHT gelöscht und nicht stillschweigend auf „verworfen" gesetzt,
      // sondern auf „neu" zurückgestellt: dann stehen sie wieder in der Durchsicht, und
      // die Entscheidung trifft der Mensch. Sichtbar statt beruhigend.
      `-- @wennTabelle umsatz
       UPDATE umsatz SET status = 'neu', istbuchung_id = NULL
       WHERE istbuchung_id IS NOT NULL
         AND istbuchung_id NOT IN (SELECT id FROM ist_buchung)`,

      `-- @wennTabelle umsatz
       INSERT OR IGNORE INTO umsatz_roh (
         id, lauf_id, buchungstag, valuta, betrag, waehrung,
         gegenpartei, gegenpartei_iban, verwendungszweck, glaeubiger_id, mandatsreferenz,
         e2e_referenz, umsatzart, buchungsschluessel, bank_referenz, roh_hash, native_id)
       SELECT id, lauf_id, buchungstag, valuta, betrag, waehrung,
         gegenpartei, gegenpartei_iban, verwendungszweck, glaeubiger_id, mandatsreferenz,
         e2e_referenz, umsatzart, buchungsschluessel, bank_referenz, roh_hash, native_id
       FROM umsatz`,

      // `geaendert_am` bekommt beim Übernehmen den Zeitpunkt des Laufs, nicht „jetzt":
      // ein Bestandsstand ist nicht dadurch frisch, dass er migriert wurde.
      `-- @wennTabelle umsatz
       INSERT OR IGNORE INTO umsatz_verarbeitung (
         umsatz_id, zahlungskonto_id, status, istbuchung_id, vorschlag_kategorie_id,
         vorschlag_charakter, vorschlag_quelle, verdacht_auf_id, verdacht_gruende, geaendert_am)
       SELECT u.id, u.zahlungskonto_id, u.status, u.istbuchung_id, u.vorschlag_kategorie_id,
         u.vorschlag_charakter, u.vorschlag_quelle, u.verdacht_auf_id, u.verdacht_gruende,
         COALESCE(l.zeitpunkt, u.buchungstag)
       FROM umsatz u LEFT JOIN import_lauf l ON l.id = u.lauf_id`,

      `DROP TABLE IF EXISTS umsatz`,

      `CREATE INDEX IF NOT EXISTS ix_umsatz_roh_hash ON umsatz_roh (roh_hash)`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_roh_native ON umsatz_roh (native_id) WHERE native_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_verarbeitung_konto ON umsatz_verarbeitung (zahlungskonto_id)`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_roh_lauf ON umsatz_roh (lauf_id)`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_roh_glaeubiger ON umsatz_roh (glaeubiger_id) WHERE glaeubiger_id IS NOT NULL`,
      // Die Inbox fragt nach offenen Zeilen, der Detail-Join nach der Buchung.
      `CREATE INDEX IF NOT EXISTS ix_umsatz_verarbeitung_status ON umsatz_verarbeitung (status)`,
      `CREATE INDEX IF NOT EXISTS ix_umsatz_verarbeitung_buchung ON umsatz_verarbeitung (istbuchung_id) WHERE istbuchung_id IS NOT NULL`,
    ],
  },
  {
    version: 45, // Der gespeicherte Dublettenverdacht war tot — und widersprach dem gerechneten
    sql: [
      // WARUM DAS WEGFÄLLT UND NICHTS AN SEINE STELLE TRITT. Der Import schrieb an jede
      // Zeile, worauf sie vermutlich zeigt. Gelesen hat das nie jemand: sämtliche
      // Dublettenanzeigen rechnen beim HINSEHEN (`ledgerVerdacht`, `entwurfVerdacht`,
      // `stapelVerdacht` in `dublettensicht.ts`), und der Kopfkommentar dort begründet
      // auch, warum — ein beim Import angeschriebener Verdacht gilt für den Stand von
      // damals, und was später aus einer anderen Quelle dazukam, würde ihn nie
      // korrigieren.
      //
      // Zwei Wahrheiten über dieselbe Frage, von denen eine niemand liest und die andere
      // recht hat: da ist Wegnehmen die Antwort und keine neue Tabelle.
      `ALTER TABLE umsatz_verarbeitung DROP COLUMN verdacht_auf_id`,
      `ALTER TABLE umsatz_verarbeitung DROP COLUMN verdacht_gruende`,

      // Die FREIGABE bleibt: „diese beiden sind nicht dasselbe" ist eine Entscheidung des
      // Menschen und aus den Daten nicht wiederherstellbar. Sie bekommt nur endlich
      // Fremdschlüssel — bisher blieben verwaiste Paare nach einem Löschen stehen und
      // griffen beim nächsten Import nicht mehr, weil die neue Zeile eine neue ID hat.
      // Am Bestand geprüft: es gibt keine verwaisten Paare, die Constraints halten.
      `CREATE TABLE IF NOT EXISTS dubletten_freigabe_neu (
         umsatz_a TEXT NOT NULL REFERENCES umsatz_roh(id) ON DELETE CASCADE,
         umsatz_b TEXT NOT NULL REFERENCES umsatz_roh(id) ON DELETE CASCADE,
         angelegt TEXT NOT NULL,
         PRIMARY KEY (umsatz_a, umsatz_b)
       )`,
      `-- @wennTabelle dubletten_freigabe
       INSERT OR IGNORE INTO dubletten_freigabe_neu (umsatz_a, umsatz_b, angelegt)
       SELECT f.umsatz_a, f.umsatz_b, f.angelegt FROM dubletten_freigabe f
       WHERE f.umsatz_a IN (SELECT id FROM umsatz_roh)
         AND f.umsatz_b IN (SELECT id FROM umsatz_roh)`,
      `DROP TABLE IF EXISTS dubletten_freigabe`,
      // Beim zweiten Durchgang ist die Zwischentabelle schon umbenannt — ohne die
      // Bedingung scheiterte das RENAME an „no such table".
      `-- @wennTabelle dubletten_freigabe_neu
       ALTER TABLE dubletten_freigabe_neu RENAME TO dubletten_freigabe`,
    ],
  },
];
