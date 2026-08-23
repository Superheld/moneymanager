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
import type { ImportLauf, Umsatz, UmsatzStatus, VorschlagQuelle } from "../../application/import";
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
  bank_referenz: string | null;
  roh_hash: string;
  native_id: string | null;
  status: string | null;
  vorschlag_kategorie_id: string | null;
  vorschlag_charakter: string | null;
  vorschlag_quelle: string | null;
  istbuchung_id: string | null;
  verdacht_auf_id: string | null;
  verdacht_gruende: string | null;
}

function zuUmsatz(z: UmsatzZeile): Umsatz {
  return {
    id: z.id,
    laufId: z.lauf_id,
    zahlungskontoId: z.zahlungskonto_id,
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
    bankreferenz: z.bank_referenz ?? undefined,
    rohHash: z.roh_hash,
    nativeId: z.native_id ?? undefined,
    // Ohne Verarbeitungszeile ist die Zeile unangetastet — also „neu".
    status: (z.status ?? "neu") as UmsatzStatus,
    vorschlag: z.vorschlag_charakter
      ? {
          kategorieId: z.vorschlag_kategorie_id ?? undefined,
          charakter: z.vorschlag_charakter as Charakter,
          quelle: (z.vorschlag_quelle ?? "manuell") as VorschlagQuelle,
        }
      : undefined,
    istbuchungId: z.istbuchung_id ?? undefined,
    verdachtAufId: z.verdacht_auf_id ?? undefined,
    verdachtGruende: z.verdacht_gruende ? (JSON.parse(z.verdacht_gruende) as string[]) : undefined,
  };
}

// Der Umsatz steht in ZWEI Tabellen und kommt als EIN Objekt zurück. Das ist Absicht:
// die Trennung ist eine Frage des Lebenszyklus (Beleg unveränderlich, Verarbeitung nicht)
// und keine der Domäne — die Anwendung arbeitet weiter mit der Importzeile als Ganzem.
//
// LEFT JOIN, nicht INNER: eine Rohzeile ohne Verarbeitungsstand ist kein Datenfehler,
// sondern der Zustand direkt nach „auf den Stand der Quelle zurücksetzen". Sie zählt dann
// als „neu" — siehe `zuUmsatz`.
const SELECT = `SELECT r.id, r.lauf_id, v.zahlungskonto_id, r.buchungstag, r.valuta, r.betrag,
       r.waehrung, r.gegenpartei, r.verwendungszweck, r.glaeubiger_id, r.gegenpartei_iban,
       r.mandatsreferenz, r.e2e_referenz, r.umsatzart, r.buchungsschluessel, r.bank_referenz,
       r.roh_hash, r.native_id,
       v.status, v.vorschlag_kategorie_id, v.vorschlag_charakter, v.vorschlag_quelle,
       v.istbuchung_id, v.verdacht_auf_id, v.verdacht_gruende
  FROM umsatz_roh r LEFT JOIN umsatz_verarbeitung v ON v.umsatz_id = r.id`;

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
function rohAnweisung(u: Umsatz): Anweisung {
  return {
    sql: `INSERT INTO umsatz_roh
       (id, lauf_id, buchungstag, valuta, betrag, waehrung, gegenpartei,
        gegenpartei_iban, verwendungszweck, glaeubiger_id, mandatsreferenz, e2e_referenz,
        umsatzart, buchungsschluessel, bank_referenz, roh_hash, native_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT(id) DO NOTHING`,
    werte: [
      u.id, u.laufId, u.buchungstag, u.valuta ?? null, u.betrag, u.waehrung,
      u.gegenpartei, u.gegenparteiIban ?? null, u.verwendungszweck, u.glaeubigerId ?? null,
      u.mandatsreferenz ?? null, u.e2eReferenz ?? null, u.umsatzart ?? null,
      u.buchungsschluessel ?? null, u.bankreferenz ?? null, u.rohHash, u.nativeId ?? null,
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
        vorschlag_charakter, vorschlag_quelle, verdacht_auf_id, verdacht_gruende, geaendert_am)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(umsatz_id) DO UPDATE SET
       zahlungskonto_id = excluded.zahlungskonto_id,
       status = excluded.status, istbuchung_id = excluded.istbuchung_id,
       vorschlag_kategorie_id = excluded.vorschlag_kategorie_id,
       vorschlag_charakter = excluded.vorschlag_charakter,
       vorschlag_quelle = excluded.vorschlag_quelle,
       verdacht_auf_id = excluded.verdacht_auf_id,
       verdacht_gruende = excluded.verdacht_gruende,
       geaendert_am = excluded.geaendert_am`,
    werte: [
      u.id, u.zahlungskontoId, u.status, u.istbuchungId ?? null,
      u.vorschlag?.kategorieId ?? null, u.vorschlag?.charakter ?? null,
      u.vorschlag?.quelle ?? null,
      u.verdachtAufId ?? null,
      u.verdachtGruende ? JSON.stringify(u.verdachtGruende) : null,
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
    await inTransaktion(db, [rohAnweisung(u), standAnweisung(u, jetzt())]);
  },
  async anlegenViele(umsaetze: readonly Umsatz[]) {
    const db = await getDb();
    const zeit = jetzt();
    await inTransaktion(
      db,
      umsaetze.flatMap((u) => [rohAnweisung(u), standAnweisung(u, zeit)]),
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
   * Die EINZIGE Stelle, an der Rohdaten nachträglich wachsen.
   *
   * Der Fall des Dublettenfinders: eine bekannte Zeile taucht in einer zweiten Quelle
   * auf, die mehr weiß (Mandatsreferenz, Valuta, Umsatzart …). Statt einer zweiten Zeile
   * bekommt die vorhandene die fehlenden Felder.
   *
   * Nur FEHLENDE — `COALESCE(vorhandener Wert, neuer Wert)` lässt Bestehendes stehen. Die
   * erste Quelle behält recht, denn alles am Umsatz hängt an ihr. Damit bleibt der Beleg
   * auch hier nur ergänzbar, nicht überschreibbar.
   */
  async ergaenzen(u: Umsatz) {
    const db = await getDb();
    await db.execute(
      `UPDATE umsatz_roh SET
         valuta = COALESCE(valuta, $2), glaeubiger_id = COALESCE(glaeubiger_id, $3),
         gegenpartei_iban = COALESCE(gegenpartei_iban, $4),
         mandatsreferenz = COALESCE(mandatsreferenz, $5),
         e2e_referenz = COALESCE(e2e_referenz, $6), umsatzart = COALESCE(umsatzart, $7),
         buchungsschluessel = COALESCE(buchungsschluessel, $8),
         bank_referenz = COALESCE(bank_referenz, $9), native_id = COALESCE(native_id, $10)
       WHERE id = $1`,
      [
        u.id, u.valuta ?? null, u.glaeubigerId ?? null, u.gegenparteiIban ?? null,
        u.mandatsreferenz ?? null, u.e2eReferenz ?? null, u.umsatzart ?? null,
        u.buchungsschluessel ?? null, u.bankreferenz ?? null, u.nativeId ?? null,
      ],
    );
  },
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<UmsatzZeile[]>(`${SELECT} ORDER BY r.buchungstag`);
    return zeilen.map(zuUmsatz);
  },
  async nachLauf(laufId: string) {
    const db = await getDb();
    const zeilen = await db.select<UmsatzZeile[]>(`${SELECT} WHERE r.lauf_id = $1 ORDER BY r.buchungstag`, [laufId]);
    return zeilen.map(zuUmsatz);
  },
  async offene() {
    const db = await getDb();
    const zeilen = await db.select<UmsatzZeile[]>(`${SELECT} WHERE COALESCE(v.status, 'neu') = 'neu' ORDER BY r.buchungstag`);
    return zeilen.map(zuUmsatz);
  },
  async loeschen(id: string) {
    const db = await getDb();
    // Der Verarbeitungsstand geht per ON DELETE CASCADE mit.
    await db.execute("DELETE FROM umsatz_roh WHERE id = $1", [id]);
  },
  async bestandsSchluessel() {
    const db = await getDb();
    // Auch die Roh-Hashes verbuchter Ist-Buchungen: umsatzVerbuchen schreibt sie mit,
    // "damit ein späterer Bankimport gegen die verbuchte Zeile deduppen kann" — gelesen
    // wurden sie bisher nie. Solange die Umsatz-Zeile existiert, deckt sie den Fall ab;
    // sobald Umsätze aufgeräumt werden (der Port kann löschen), fiele die Grundlage weg.
    const h = await db.select<{ roh_hash: string }[]>(
      `SELECT roh_hash FROM umsatz_roh
       UNION
       SELECT roh_hash FROM ist_buchung WHERE roh_hash IS NOT NULL`,
    );
    const n = await db.select<{ native_id: string }[]>("SELECT native_id FROM umsatz_roh WHERE native_id IS NOT NULL");
    const o = await db.select<{ roh_hash: string }[]>(
      "SELECT roh_hash FROM umsatz_roh WHERE native_id IS NULL",
    );
    return {
      hashes: h.map((r) => r.roh_hash),
      nativeIds: n.map((r) => r.native_id),
      hashesOhneId: o.map((r) => r.roh_hash),
    };
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
