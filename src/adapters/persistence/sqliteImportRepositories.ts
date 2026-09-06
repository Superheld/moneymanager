// SQLite-Adapter der Import-Ports. `import_lauf` ist ein dünnes Protokoll; die Importzeile
// selbst steht in ZWEI Tabellen:
//
//   umsatz_roh           der Beleg, wie die Quelle ihn lieferte — nach dem Anlegen
//                        unveränderlich, mit den Dedup-Schlüsseln (roh_hash, native_id)
//   umsatz_verarbeitung  was wir daraus gemacht haben — Status, Kategorievorschlag,
//                        erzeugte Buchung, Dublettenverdacht
//
// Nach oben ist es EIN `Umsatz`: die Trennung ist eine Frage des Lebenszyklus, keine der
// Domäne. Sichtbar wird sie nur an den Schreibwegen — `anlegen` schreibt beides,
// `speichern` nur den Stand, und `ergaenzen` ist die einzige Ausnahme, die Rohdaten noch
// anfasst.

import type { Charakter } from "../../core";
import type {
  DublettenfreigabeRepository,
  ImportLaufRepository,
  UmsatzRepository,
} from "../../application/ports";
import type { Dublettenfreigabe } from "../../application/dubletten/dublettensicht";
import type {
  Beleg,
  ImportLauf,
  RohSammelposten,
  Umsatz,
  UmsatzStatus,
  VorschlagQuelle,
} from "../../application/import";
import { zusammenfuehren } from "../../application/import";
import { getDb } from "./db";
import { inTransaktion, type Anweisung } from "./transaktion";

interface LaufZeile {
  id: string;
  quelle: string;
  zeitpunkt: string;
  dateiname: string | null;
  eingelesen: number;
  neu: number;
  duplikate: number;
  zugang_id: string | null;
  zahlungskonto_id: string | null;
  format: string | null;
  abgeschnitten: number | null;
}

export const sqliteImportLaufRepository: ImportLaufRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<LaufZeile[]>(
      `SELECT id, quelle, zeitpunkt, dateiname, eingelesen, neu, duplikate,
              zugang_id, zahlungskonto_id, format, abgeschnitten
         FROM import_lauf ORDER BY zeitpunkt DESC`,
    );
    return zeilen.map(
      (z): ImportLauf => ({
        id: z.id,
        quelle: z.quelle,
        zeitpunkt: z.zeitpunkt,
        dateiname: z.dateiname ?? undefined,
        eingelesen: z.eingelesen,
        neu: z.neu,
        duplikate: z.duplikate,
        zugangId: z.zugang_id ?? undefined,
        zahlungskontoId: z.zahlungskonto_id ?? undefined,
        format: z.format ?? undefined,
        // Nur setzen, wenn er WIRKLICH steht: `false` überall wäre dasselbe wie
        // undefined, macht aber jeden Vergleich in Tests unnötig laut.
        abgeschnitten: z.abgeschnitten ? true : undefined,
      }),
    );
  },
  async speichern(l: ImportLauf) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO import_lauf (id, quelle, zeitpunkt, dateiname, eingelesen, neu, duplikate,
                                zugang_id, zahlungskonto_id, format, abgeschnitten)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT(id) DO UPDATE SET quelle = excluded.quelle, zeitpunkt = excluded.zeitpunkt,
         dateiname = excluded.dateiname, eingelesen = excluded.eingelesen,
         neu = excluded.neu, duplikate = excluded.duplikate,
         zugang_id = excluded.zugang_id, zahlungskonto_id = excluded.zahlungskonto_id,
         format = excluded.format, abgeschnitten = excluded.abgeschnitten`,
      [
        l.id, l.quelle, l.zeitpunkt, l.dateiname ?? null, l.eingelesen, l.neu, l.duplikate,
        l.zugangId ?? null, l.zahlungskontoId ?? null, l.format ?? null, l.abgeschnitten ? 1 : 0,
      ],
    );
  },
  async loeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM import_lauf WHERE id = $1", [id]);
  },
};

interface UmsatzZeile {
  id: string;
  lauf_id: string;
  zahlung_id: string;
  /** Aus `import_lauf` — aus Quelle und Format entsteht der Rang des Belegs. */
  quelle: string | null;
  format: string | null;
  zeitpunkt: string | null;
  zahlungskonto_id: string;
  buchungstag: string;
  valuta: string | null;
  betrag: number;
  waehrung: string;
  gegenpartei: string;
  verwendungszweck: string;
  glaeubiger_id: string | null;
  gegenpartei_iban: string | null;
  mandatsreferenz: string | null;
  e2e_referenz: string | null;
  umsatzart: string | null;
  buchungsschluessel: string | null;
  zweck_code: string | null;
  endempfaenger: string | null;
  bank_referenz: string | null;
  eintrag_referenz: string | null;
  bank_buchungscode: string | null;
  transaktions_id: string | null;
  strukturierte_referenz: string | null;
  sammelposten: string | null;
  buchungsstand: string | null;
  ist_storno: number | null;
  original_betrag: number | null;
  original_waehrung: string | null;
  wechselkurs: number | null;
  gebuehr_betrag: number | null;
  gebuehr_waehrung: string | null;
  ruecklauf_code: string | null;
  ruecklauf_text: string | null;
  kundenreferenz: string | null;
  bankfelder: string | null;
  roh_hash: string;
  native_id: string | null;
  status: string | null;
  vorschlag_kategorie_id: string | null;
  vorschlag_charakter: string | null;
  vorschlag_quelle: string | null;
  istbuchung_id: string | null;
}

/**
 * Die Sammelposten als JSON-Text — dasselbe Muster wie `inhaber_ids` beim Konto und die
 * Merkmale einer Vertragsregel.
 *
 * Eine LEERE Liste wird zu `null` und nicht zu `"[]"`: „keine Sammelposten" und „eine
 * Sammelbuchung ohne Zahlungen darin" wären sonst dieselbe Zelle, und die zweite gibt es
 * nicht.
 */
function sammelpostenAls(posten: readonly RohSammelposten[] | undefined): string | null {
  return posten && posten.length > 0 ? JSON.stringify(posten) : null;
}

/**
 * Und zurück. Kaputtes JSON ergibt `undefined` statt eines Wurfs: die Posten sind Beiwerk,
 * und eine unlesbare Nebenangabe darf die Buchung nicht mitnehmen — der Betrag, das Datum
 * und die Kategorie daran stimmen ja.
 */
function sammelpostenAus(text: string | null): readonly RohSammelposten[] | undefined {
  if (!text) return undefined;
  try {
    const gelesen = JSON.parse(text);
    return Array.isArray(gelesen) && gelesen.length > 0 ? (gelesen as RohSammelposten[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Dieselbe Behandlung wie bei den Sammelposten: leer wird `null`, kaputt wird `undefined`. */
function bankfelderAls(felder: Readonly<Record<string, unknown>> | undefined): string | null {
  return felder && Object.keys(felder).length > 0 ? JSON.stringify(felder) : null;
}

function bankfelderAus(text: string | null): Readonly<Record<string, unknown>> | undefined {
  if (!text) return undefined;
  try {
    const gelesen = JSON.parse(text);
    return gelesen && typeof gelesen === "object" && !Array.isArray(gelesen)
      ? (gelesen as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Eine Zeile wird ein BELEG, nicht mehr ein Umsatz.
 *
 * Der Umsatz entsteht erst aus allen Belegen einer Zahlung (`zuUmsaetze`). Was hier
 * herauskommt, ist die Fassung EINER Quelle, genau so wie sie geliefert hat.
 */
function zuBeleg(z: UmsatzZeile): Beleg {
  return {
    id: z.id,
    laufId: z.lauf_id,
    // Ohne Lauf: leere Quelle. Sie steht in keinem `ABRUF_QUELLEN`, der Beleg bekommt
    // damit den schwächsten Rang — sichtbar, aber ohne Vorrang.
    quelle: z.quelle ?? "",
    format: z.format ?? undefined,
    zeitpunkt: z.zeitpunkt ?? "",
    buchungstag: z.buchungstag,
    valuta: z.valuta ?? undefined,
    betrag: z.betrag,
    waehrung: z.waehrung,
    gegenpartei: z.gegenpartei,
    verwendungszweck: z.verwendungszweck,
    glaeubigerId: z.glaeubiger_id ?? undefined,
    gegenparteiIban: z.gegenpartei_iban ?? undefined,
    mandatsreferenz: z.mandatsreferenz ?? undefined,
    e2eReferenz: z.e2e_referenz ?? undefined,
    umsatzart: z.umsatzart ?? undefined,
    buchungsschluessel: z.buchungsschluessel ?? undefined,
    zweckCode: z.zweck_code ?? undefined,
    endempfaenger: z.endempfaenger ?? undefined,
    bankreferenz: z.bank_referenz ?? undefined,
    eintragReferenz: z.eintrag_referenz ?? undefined,
    bankBuchungscode: z.bank_buchungscode ?? undefined,
    transaktionsId: z.transaktions_id ?? undefined,
    strukturierteReferenz: z.strukturierte_referenz ?? undefined,
    sammelposten: sammelpostenAus(z.sammelposten),
    buchungsstand: z.buchungsstand ?? undefined,
    // 0/1 in SQLite, ein Boolean nach oben — und `null` bleibt „nicht gesagt".
    istStorno: z.ist_storno === null ? undefined : z.ist_storno !== 0,
    originalBetrag: z.original_betrag ?? undefined,
    originalWaehrung: z.original_waehrung ?? undefined,
    wechselkurs: z.wechselkurs ?? undefined,
    gebuehrBetrag: z.gebuehr_betrag ?? undefined,
    gebuehrWaehrung: z.gebuehr_waehrung ?? undefined,
    ruecklaufCode: z.ruecklauf_code ?? undefined,
    ruecklaufText: z.ruecklauf_text ?? undefined,
    kundenreferenz: z.kundenreferenz ?? undefined,
    bankfelder: bankfelderAus(z.bankfelder),
    rohHash: z.roh_hash,
    nativeId: z.native_id ?? undefined,
  };
}

/**
 * Aus den Belegzeilen werden die Zahlungen — je Zahlung EIN `Umsatz`.
 *
 * Die Felder entstehen ueber `zusammenfuehren`; der Verarbeitungsstand kommt aus der
 * Zeile, die jede Belegzeile derselben Zahlung identisch mitbringt (der JOIN haengt an
 * `zahlung_id`). Die Reihenfolge der Zahlungen ist die der Abfrage — sortiert wird in
 * SQL, nicht hier.
 */
function zuUmsaetze(zeilen: readonly UmsatzZeile[]): Umsatz[] {
  const gruppen = new Map<string, { stand: UmsatzZeile; belege: Beleg[] }>();
  for (const z of zeilen) {
    const vorhanden = gruppen.get(z.zahlung_id);
    if (vorhanden) vorhanden.belege.push(zuBeleg(z));
    else gruppen.set(z.zahlung_id, { stand: z, belege: [zuBeleg(z)] });
  }
  return [...gruppen.entries()].map(([zahlungId, { stand, belege }]) => ({
    ...zusammenfuehren(belege, zahlungId),
    belege,
    zahlungskontoId: stand.zahlungskonto_id,
    // Ohne Verarbeitungszeile ist die Zahlung unangetastet — also „neu".
    status: (stand.status ?? "neu") as UmsatzStatus,
    vorschlag: stand.vorschlag_charakter
      ? {
          kategorieId: stand.vorschlag_kategorie_id ?? undefined,
          charakter: stand.vorschlag_charakter as Charakter,
          quelle: (stand.vorschlag_quelle ?? "manuell") as VorschlagQuelle,
        }
      : undefined,
    istbuchungId: stand.istbuchung_id ?? undefined,
  }));
}

// Der Umsatz steht in ZWEI Tabellen und kommt als EIN Objekt zurück. Das ist Absicht:
// die Trennung ist eine Frage des Lebenszyklus (Beleg unveränderlich, Verarbeitung nicht)
// und keine der Domäne — die Anwendung arbeitet weiter mit der Importzeile als Ganzem.
//
// LEFT JOIN, nicht INNER: eine Rohzeile ohne Verarbeitungsstand ist kein Datenfehler,
// sondern der Zustand direkt nach „auf den Stand der Quelle zurücksetzen". Sie zählt dann
// als „neu" — siehe `zuUmsaetze`.
//
// Der Verarbeitungs-JOIN hängt seit dem 06.09.2026 an `zahlung_id` statt an `r.id`: eine
// Zahlung kann mehrere Belege haben, und der Stand gilt für sie alle. Jede Belegzeile
// bringt ihn deshalb identisch mit; `zuUmsaetze` nimmt ihn einmal.
//
// `COALESCE(zahlung_id, id)` ueberall: die Spalte kam mit Migration 71 dazu, und wer eine
// Rohzeile an den Repositories vorbei einfuegt (Spielstand, Fixtures), fuellt sie leicht
// nicht. Ohne den Rueckfall fielen alle solchen Zeilen unter EINEN Schluessel zusammen und
// wuerden zu einer einzigen Zahlung verschmolzen — ein Datenverlust, den man erst bemerkt,
// wenn eine Liste kuerzer ist als erwartet. Eine Zeile ohne Zahlung ist ihre eigene.
//
// Der Lauf kommt dazu, weil aus Quelle und Format der RANG eines Belegs entsteht — und
// zwar ebenfalls als LEFT JOIN. Ein INNER wäre die schärfere Aussage und die gefährlichere
// Naht: fehlt der Lauf, verschwände der Beleg SPURLOS aus jeder Liste. Der Fremdschlüssel
// hält das in der App zwar, aber ein Leseweg, der bei einer Unstimmigkeit still weniger
// liefert, ist genau die Sorte Fehler, die man erst bemerkt, wenn eine Summe nicht mehr
// aufgeht. Ohne Lauf bekommt der Beleg den schwächsten Rang und bleibt sichtbar.
const SELECT = `SELECT r.id, r.lauf_id, COALESCE(r.zahlung_id, r.id) AS zahlung_id,
       l.quelle, l.format, l.zeitpunkt,
       v.zahlungskonto_id, r.buchungstag, r.valuta, r.betrag,
       r.waehrung, r.gegenpartei, r.verwendungszweck, r.glaeubiger_id, r.gegenpartei_iban,
       r.mandatsreferenz, r.e2e_referenz, r.umsatzart, r.buchungsschluessel,
       r.zweck_code, r.endempfaenger, r.bank_referenz,
       r.eintrag_referenz, r.bank_buchungscode, r.transaktions_id, r.strukturierte_referenz,
       r.sammelposten, r.buchungsstand, r.ist_storno,
       r.original_betrag, r.original_waehrung, r.wechselkurs,
       r.gebuehr_betrag, r.gebuehr_waehrung, r.ruecklauf_code, r.ruecklauf_text,
       r.kundenreferenz, r.bankfelder,
       r.roh_hash, r.native_id,
       v.status, v.vorschlag_kategorie_id, v.vorschlag_charakter, v.vorschlag_quelle,
       v.istbuchung_id
  FROM umsatz_roh r
       LEFT JOIN umsatz_verarbeitung v ON v.umsatz_id = COALESCE(r.zahlung_id, r.id)
       LEFT JOIN import_lauf l ON l.id = r.lauf_id`;

/**
 * Wann der Verarbeitungsstand zuletzt angefasst wurde.
 *
 * Die Uhr steht im Adapter, nicht im Kern — der Kern kennt keine (CLAUDE.md). Ein Import
 * setzt für alle seine Zeilen DENSELBEN Zeitpunkt: sie gehören zu einem Vorgang, und
 * Millisekunden-Unterschiede darin wären erfunden, nicht gemessen.
 */
function jetzt(): string {
  return new Date().toISOString();
}

/** Die Rohzeile — der Beleg. Wird beim Anlegen geschrieben und danach nie wieder. */
function rohAnweisung(u: Umsatz, zahlungId: string): Anweisung {
  return {
    sql: `INSERT INTO umsatz_roh
       (id, lauf_id, zahlung_id, buchungstag, valuta, betrag, waehrung, gegenpartei,
        gegenpartei_iban, verwendungszweck, glaeubiger_id, mandatsreferenz, e2e_referenz,
        umsatzart, buchungsschluessel, zweck_code, endempfaenger, bank_referenz,
        eintrag_referenz, bank_buchungscode, transaktions_id, strukturierte_referenz,
        sammelposten, buchungsstand, ist_storno, original_betrag, original_waehrung,
        wechselkurs, gebuehr_betrag, gebuehr_waehrung, ruecklauf_code, ruecklauf_text,
        kundenreferenz, bankfelder,
        roh_hash, native_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
             $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
     ON CONFLICT(id) DO NOTHING`,
    werte: [
      u.id, u.laufId, zahlungId, u.buchungstag, u.valuta ?? null, u.betrag, u.waehrung,
      u.gegenpartei, u.gegenparteiIban ?? null, u.verwendungszweck, u.glaeubigerId ?? null,
      u.mandatsreferenz ?? null, u.e2eReferenz ?? null, u.umsatzart ?? null,
      u.buchungsschluessel ?? null, u.zweckCode ?? null, u.endempfaenger ?? null,
      u.bankreferenz ?? null,
      u.eintragReferenz ?? null, u.bankBuchungscode ?? null, u.transaktionsId ?? null,
      u.strukturierteReferenz ?? null,
      sammelpostenAls(u.sammelposten),
      u.buchungsstand ?? null, u.istStorno === undefined ? null : u.istStorno ? 1 : 0,
      u.originalBetrag ?? null, u.originalWaehrung ?? null, u.wechselkurs ?? null,
      u.gebuehrBetrag ?? null, u.gebuehrWaehrung ?? null,
      u.ruecklaufCode ?? null, u.ruecklaufText ?? null,
      u.kundenreferenz ?? null, bankfelderAls(u.bankfelder),
      u.rohHash, u.nativeId ?? null,
    ],
  };
}

/**
 * Der Verarbeitungsstand — alles, was wir aus dem Beleg gemacht haben.
 *
 * `DO NOTHING` beim Anlegen wäre hier falsch: Status und Vorschlag ändern sich, das ist
 * ihr Zweck. Deshalb `DO UPDATE`.
 */
function standAnweisung(u: Umsatz, jetzt: string): Anweisung {
  return {
    sql: `INSERT INTO umsatz_verarbeitung
       (umsatz_id, zahlungskonto_id, status, istbuchung_id, vorschlag_kategorie_id,
        vorschlag_charakter, vorschlag_quelle, geaendert_am)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(umsatz_id) DO UPDATE SET
       zahlungskonto_id = excluded.zahlungskonto_id,
       status = excluded.status, istbuchung_id = excluded.istbuchung_id,
       vorschlag_kategorie_id = excluded.vorschlag_kategorie_id,
       vorschlag_charakter = excluded.vorschlag_charakter,
       vorschlag_quelle = excluded.vorschlag_quelle,
       geaendert_am = excluded.geaendert_am`,
    werte: [
      u.id, u.zahlungskontoId, u.status, u.istbuchungId ?? null,
      u.vorschlag?.kategorieId ?? null, u.vorschlag?.charakter ?? null,
      u.vorschlag?.quelle ?? null,
      jetzt,
    ],
  };
}

export const sqliteUmsatzRepository: UmsatzRepository = {
  /**
   * Legt eine Importzeile an: Beleg UND Verarbeitungsstand, in EINER Transaktion.
   *
   * Ohne die Klammer entstünde bei einem Abbruch eine Rohzeile ohne Stand — die läse sich
   * als „neu" und käme beim nächsten Import als Dublette wieder. Genau dafür gibt es den
   * Transaktions-Command.
   */
  async anlegen(u: Umsatz) {
    const db = await getDb();
    await inTransaktion(db, [rohAnweisung(u, u.id), standAnweisung(u, jetzt())]);
  },
  async anlegenViele(umsaetze: readonly Umsatz[]) {
    const db = await getDb();
    const zeit = jetzt();
    await inTransaktion(
      db,
      umsaetze.flatMap((u) => [rohAnweisung(u, u.id), standAnweisung(u, zeit)]),
    );
  },
  /**
   * Schreibt NUR den Verarbeitungsstand. Der Beleg bleibt, wie er kam.
   *
   * Das ist der Unterschied zu früher, als eine Methode beides schrieb: eine
   * Statusänderung konnte damals unbemerkt Rohfelder mitziehen. Wer Rohdaten ändern
   * MUSS, nimmt `ergaenzen` — und man sieht an der Aufrufstelle, dass es passiert.
   */
  async speichern(u: Umsatz) {
    const db = await getDb();
    const a = standAnweisung(u, jetzt());
    await db.execute(a.sql, [...(a.werte ?? [])]);
  },
  /**
   * Hängt einen weiteren Beleg an eine vorhandene Zahlung.
   *
   * Der Nachfolger von `ergaenzen`, und der Unterschied ist der ganze Punkt: `ergaenzen`
   * schrieb fehlende Felder in die VORHANDENE Zeile und warf die eingehende weg. Hier
   * wird nichts angefasst und nichts weggeworfen — die zweite Fassung legt sich daneben,
   * mit ihrem eigenen Lauf. Welcher Wert gilt, entscheidet erst das Lesen
   * (`application/import/belege.ts`).
   *
   * Damit ist der Beleg endlich ohne Ausnahme unveränderlich: die Zusicherung aus dem
   * GoBD-Abschnitt der CLAUDE.md wird strenger, statt zu bröckeln.
   *
   * Der Verarbeitungsstand bleibt unberührt — er gehört der Zahlung, nicht dem Beleg.
   * Kategorie, Verbuchung und Aufteilungen hängen also weiter an dem, was sie kennen.
   */
  async belegAnhaengen(zahlungId: string, beleg: Umsatz) {
    const db = await getDb();
    const a = rohAnweisung(beleg, zahlungId);
    await db.execute(a.sql, [...(a.werte ?? [])]);
  },
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<UmsatzZeile[]>(`${SELECT} ORDER BY r.buchungstag`);
    return zuUmsaetze(zeilen);
  },
  async nachLauf(laufId: string) {
    const db = await getDb();
    // Über die ZAHLUNGEN des Laufs, nicht über seine Belege: eine Zahlung, an der dieser
    // Lauf mitgeschrieben hat, gehört vollständig hierher — mit allen ihren Belegen.
    // Filterte man auf `r.lauf_id`, sähe `zuUmsaetze` nur einen Teil und führte eine
    // Zahlung zusammen, die es so nie gab.
    const zeilen = await db.select<UmsatzZeile[]>(
      `${SELECT} WHERE COALESCE(r.zahlung_id, r.id) IN
         (SELECT COALESCE(zahlung_id, id) FROM umsatz_roh WHERE lauf_id = $1)
       ORDER BY r.buchungstag`,
      [laufId],
    );
    return zuUmsaetze(zeilen);
  },
  async offene() {
    const db = await getDb();
    const zeilen = await db.select<UmsatzZeile[]>(
      `${SELECT} WHERE COALESCE(v.status, 'neu') = 'neu' ORDER BY r.buchungstag`,
    );
    return zuUmsaetze(zeilen);
  },
  async loeschen(id: string) {
    const db = await getDb();
    // ALLE Belege der Zahlung, nicht nur den namengebenden: eine Zahlung ohne ihren
    // ersten Beleg wäre eine, deren Herkunft niemand mehr feststellen kann — und der
    // Verarbeitungsstand hängt per Fremdschlüssel an genau dessen Id.
    // Der Stand geht per ON DELETE CASCADE mit.
    await db.execute("DELETE FROM umsatz_roh WHERE COALESCE(zahlung_id, id) = $1", [id]);
  },
};

/**
 * Die von Hand gesetzten „ist kein Duplikat"-Entscheidungen.
 *
 * Sortiert wird im Use-Case (`freigabeAus`), nicht hier — die Tabelle kann die Ordnung
 * nicht erzwingen, und ein zweites Sortieren an dieser Stelle täuschte eine Sicherheit
 * vor, die es nicht gibt. Gelöscht wird dafür in BEIDE Richtungen: ein Aufrufer, der die
 * IDs andersherum hält, soll nicht ins Leere greifen.
 */
export const sqliteDublettenfreigabeRepository: DublettenfreigabeRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<{ umsatz_a: string; umsatz_b: string; angelegt: string }[]>(
      "SELECT umsatz_a, umsatz_b, angelegt FROM dubletten_freigabe",
    );
    return zeilen.map((z) => ({ umsatzA: z.umsatz_a, umsatzB: z.umsatz_b, angelegt: z.angelegt }));
  },
  async speichern(f: Dublettenfreigabe) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO dubletten_freigabe (umsatz_a, umsatz_b, angelegt) VALUES ($1, $2, $3)
       ON CONFLICT(umsatz_a, umsatz_b) DO UPDATE SET angelegt = excluded.angelegt`,
      [f.umsatzA, f.umsatzB, f.angelegt],
    );
  },
  async entfernen(umsatzA: string, umsatzB: string) {
    const db = await getDb();
    await db.execute(
      `DELETE FROM dubletten_freigabe
        WHERE (umsatz_a = $1 AND umsatz_b = $2) OR (umsatz_a = $2 AND umsatz_b = $1)`,
      [umsatzA, umsatzB],
    );
  },
};
