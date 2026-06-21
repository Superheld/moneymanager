// SQLite-Adapter der Import-Ports (TAKTIK-IMPORT). import_lauf = dünnes Protokoll,
// umsatz = der Entwurfs-Stapel mit Dedup-Schlüsseln (roh_hash + native_id) und dem
// flach abgelegten Kategorie-Vorschlag.

import type { Charakter } from "../../core";
import type { ImportLaufRepository, UmsatzRepository } from "../../application/ports";
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
  roh_hash: string;
  native_id: string | null;
  status: string;
  vorschlag_kategorie_id: string | null;
  vorschlag_charakter: string | null;
  vorschlag_quelle: string | null;
  istbuchung_id: string | null;
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
  };
}

const SELECT = `SELECT id, lauf_id, zahlungskonto_id, buchungstag, valuta, betrag, waehrung,
       gegenpartei, verwendungszweck, roh_hash, native_id, status,
       vorschlag_kategorie_id, vorschlag_charakter, vorschlag_quelle, istbuchung_id
  FROM umsatz`;

async function einfuegen(db: Awaited<ReturnType<typeof getDb>>, u: Umsatz): Promise<void> {
  await db.execute(
    `INSERT INTO umsatz
       (id, lauf_id, zahlungskonto_id, buchungstag, valuta, betrag, waehrung, gegenpartei,
        verwendungszweck, roh_hash, native_id, status,
        vorschlag_kategorie_id, vorschlag_charakter, vorschlag_quelle, istbuchung_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT(id) DO UPDATE SET zahlungskonto_id = excluded.zahlungskonto_id,
       status = excluded.status, vorschlag_kategorie_id = excluded.vorschlag_kategorie_id,
       vorschlag_charakter = excluded.vorschlag_charakter, vorschlag_quelle = excluded.vorschlag_quelle,
       istbuchung_id = excluded.istbuchung_id`,
    [
      u.id, u.laufId, u.zahlungskontoId, u.buchungstag, u.valuta ?? null, u.betrag, u.waehrung,
      u.gegenpartei, u.verwendungszweck, u.rohHash, u.nativeId ?? null, u.status,
      u.vorschlag?.kategorieId ?? null, u.vorschlag?.charakter ?? null, u.vorschlag?.quelle ?? null,
      u.istbuchungId ?? null,
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
    const h = await db.select<{ roh_hash: string }[]>("SELECT roh_hash FROM umsatz");
    const n = await db.select<{ native_id: string }[]>("SELECT native_id FROM umsatz WHERE native_id IS NOT NULL");
    return { hashes: h.map((r) => r.roh_hash), nativeIds: n.map((r) => r.native_id) };
  },
};
