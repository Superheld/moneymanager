// SQLite-Adapter der Import-Ports (TAKTIK-IMPORT). import_lauf = dünnes Protokoll,
// umsatz = der Entwurfs-Stapel mit Dedup-Schlüsseln (roh_hash + native_id) und dem
// flach abgelegten Kategorie-Vorschlag.

import type { Charakter } from "../../core";
import type {
  DublettenfreigabeRepository,
  ImportLaufRepository,
  UmsatzRepository,
} from "../../application/ports";
import type { Dublettenfreigabe } from "../../application/dubletten/dublettensicht";
import type { ImportLauf, Umsatz, UmsatzStatus, VorschlagQuelle } from "../../application/import";
import { getDb } from "./db";

interface LaufZeile {
  id: string;
  quelle: string;
  zeitpunkt: string;
  dateiname: string | null;
  eingelesen: number;
  neu: number;
  duplikate: number;
}

export const sqliteImportLaufRepository: ImportLaufRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<LaufZeile[]>(
      `SELECT id, quelle, zeitpunkt, dateiname, eingelesen, neu, duplikate
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
      }),
    );
  },
  async speichern(l: ImportLauf) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO import_lauf (id, quelle, zeitpunkt, dateiname, eingelesen, neu, duplikate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET quelle = excluded.quelle, zeitpunkt = excluded.zeitpunkt,
         dateiname = excluded.dateiname, eingelesen = excluded.eingelesen,
         neu = excluded.neu, duplikate = excluded.duplikate`,
      [l.id, l.quelle, l.zeitpunkt, l.dateiname ?? null, l.eingelesen, l.neu, l.duplikate],
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
  status: string;
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
    status: z.status as UmsatzStatus,
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

const SELECT = `SELECT id, lauf_id, zahlungskonto_id, buchungstag, valuta, betrag, waehrung,
       gegenpartei, verwendungszweck, glaeubiger_id, gegenpartei_iban, mandatsreferenz,
       e2e_referenz, umsatzart, buchungsschluessel, bank_referenz,
       roh_hash, native_id, status,
       vorschlag_kategorie_id, vorschlag_charakter, vorschlag_quelle, istbuchung_id,
       verdacht_auf_id, verdacht_gruende
  FROM umsatz`;

async function einfuegen(db: Awaited<ReturnType<typeof getDb>>, u: Umsatz): Promise<void> {
  await db.execute(
    // Beim Aktualisieren werden auch die Quellenfelder nachgezogen: das ist der
    // Ergänzen-Fall des Dublettenfinders — eine bekannte Zeile bekommt, was die neue
    // Quelle mehr weiß (Mandatsreferenz, Valuta, Umsatzart …), ohne dass eine zweite
    // Zeile entsteht. Der Aufrufer entscheidet, was er übergibt; leer überschreibt nicht,
    // weil er den Bestand vorher hineinmischt.
    `INSERT INTO umsatz
       (id, lauf_id, zahlungskonto_id, buchungstag, valuta, betrag, waehrung, gegenpartei,
        verwendungszweck, glaeubiger_id, gegenpartei_iban, mandatsreferenz, e2e_referenz,
        umsatzart, buchungsschluessel, bank_referenz, roh_hash, native_id, status,
        vorschlag_kategorie_id, vorschlag_charakter, vorschlag_quelle, istbuchung_id,
        verdacht_auf_id, verdacht_gruende)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     ON CONFLICT(id) DO UPDATE SET zahlungskonto_id = excluded.zahlungskonto_id,
       valuta = excluded.valuta, glaeubiger_id = excluded.glaeubiger_id,
       gegenpartei_iban = excluded.gegenpartei_iban, mandatsreferenz = excluded.mandatsreferenz,
       e2e_referenz = excluded.e2e_referenz, umsatzart = excluded.umsatzart,
       buchungsschluessel = excluded.buchungsschluessel, bank_referenz = excluded.bank_referenz,
       native_id = excluded.native_id,
       status = excluded.status, vorschlag_kategorie_id = excluded.vorschlag_kategorie_id,
       vorschlag_charakter = excluded.vorschlag_charakter, vorschlag_quelle = excluded.vorschlag_quelle,
       istbuchung_id = excluded.istbuchung_id,
       verdacht_auf_id = excluded.verdacht_auf_id, verdacht_gruende = excluded.verdacht_gruende`,
    [
      u.id, u.laufId, u.zahlungskontoId, u.buchungstag, u.valuta ?? null, u.betrag, u.waehrung,
      u.gegenpartei, u.verwendungszweck, u.glaeubigerId ?? null, u.gegenparteiIban ?? null,
      u.mandatsreferenz ?? null, u.e2eReferenz ?? null, u.umsatzart ?? null,
      u.buchungsschluessel ?? null, u.bankreferenz ?? null,
      u.rohHash, u.nativeId ?? null, u.status,
      u.vorschlag?.kategorieId ?? null, u.vorschlag?.charakter ?? null, u.vorschlag?.quelle ?? null,
      u.istbuchungId ?? null,
      u.verdachtAufId ?? null,
      u.verdachtGruende ? JSON.stringify(u.verdachtGruende) : null,
    ],
  );
}

export const sqliteUmsatzRepository: UmsatzRepository = {
  async speichern(u: Umsatz) {
    const db = await getDb();
    await einfuegen(db, u);
  },
  async speichernViele(umsaetze: readonly Umsatz[]) {
    const db = await getDb();
    for (const u of umsaetze) await einfuegen(db, u);
  },
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<UmsatzZeile[]>(`${SELECT} ORDER BY buchungstag`);
    return zeilen.map(zuUmsatz);
  },
  async nachLauf(laufId: string) {
    const db = await getDb();
    const zeilen = await db.select<UmsatzZeile[]>(`${SELECT} WHERE lauf_id = $1 ORDER BY buchungstag`, [laufId]);
    return zeilen.map(zuUmsatz);
  },
  async offene() {
    const db = await getDb();
    const zeilen = await db.select<UmsatzZeile[]>(`${SELECT} WHERE status = 'neu' ORDER BY buchungstag`);
    return zeilen.map(zuUmsatz);
  },
  async loeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM umsatz WHERE id = $1", [id]);
  },
  async bestandsSchluessel() {
    const db = await getDb();
    // Auch die Roh-Hashes verbuchter Ist-Buchungen: umsatzVerbuchen schreibt sie mit,
    // "damit ein späterer Bankimport gegen die verbuchte Zeile deduppen kann" — gelesen
    // wurden sie bisher nie. Solange die Umsatz-Zeile existiert, deckt sie den Fall ab;
    // sobald Umsätze aufgeräumt werden (der Port kann löschen), fiele die Grundlage weg.
    const h = await db.select<{ roh_hash: string }[]>(
      `SELECT roh_hash FROM umsatz
       UNION
       SELECT roh_hash FROM ist_buchung WHERE roh_hash IS NOT NULL`,
    );
    const n = await db.select<{ native_id: string }[]>("SELECT native_id FROM umsatz WHERE native_id IS NOT NULL");
    const o = await db.select<{ roh_hash: string }[]>(
      "SELECT roh_hash FROM umsatz WHERE native_id IS NULL",
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
