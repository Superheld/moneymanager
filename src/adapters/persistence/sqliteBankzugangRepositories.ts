// SQLite-Implementierung für Bankzugänge und Konto-Zuordnungen (Migration 26).
//
// Was hier NICHT liegt: die PIN. Sie wird pro Sitzung eingegeben, durchgereicht und
// vergessen — deshalb kommt sie in keiner Spalte und in keinem Parameter dieser Datei vor.

import type { Bankzugang } from "../../application/fints/abrufPort";
import type {
  BankzugangRepository,
  Kontozuordnung,
  KontozuordnungRepository,
} from "../../application/fints/bankzugangPort";
import { getDb } from "./db";

interface ZugangZeile {
  id: string;
  bezeichnung: string;
  url: string;
  blz: string;
  benutzer: string;
  kunden_id: string | null;
  bankparameter: string | null;
  tan_verfahren_id: number | null;
  tan_medium: string | null;
}

interface ZuordnungZeile {
  zugang_id: string;
  schluessel: string;
  zahlungskonto_id: string;
  letzter_abruf_bis: string | null;
  bank_saldo: number | null;
  bank_saldo_datum: string | null;
}

export const sqliteBankzugangRepository: BankzugangRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<ZugangZeile[]>(
      `SELECT id, bezeichnung, url, blz, benutzer, kunden_id, bankparameter,
              tan_verfahren_id, tan_medium
         FROM bankzugang ORDER BY bezeichnung`,
    );
    return zeilen.map((z) => ({
      id: z.id,
      bezeichnung: z.bezeichnung,
      url: z.url,
      blz: z.blz,
      benutzer: z.benutzer,
      kundenId: z.kunden_id ?? undefined,
      bankparameter: z.bankparameter ?? undefined,
      tanVerfahrenId: z.tan_verfahren_id ?? undefined,
      tanMedium: z.tan_medium ?? undefined,
    }));
  },

  async speichern(z: Bankzugang) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, kunden_id, bankparameter,
                               tan_verfahren_id, tan_medium, angelegt_am)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT(id) DO UPDATE SET bezeichnung      = excluded.bezeichnung,
                                     url              = excluded.url,
                                     blz              = excluded.blz,
                                     benutzer         = excluded.benutzer,
                                     kunden_id        = excluded.kunden_id,
                                     bankparameter    = excluded.bankparameter,
                                     tan_verfahren_id = excluded.tan_verfahren_id,
                                     tan_medium       = excluded.tan_medium`,
      [
        z.id,
        z.bezeichnung,
        z.url,
        z.blz,
        z.benutzer,
        z.kundenId ?? null,
        z.bankparameter ?? null,
        z.tanVerfahrenId ?? null,
        z.tanMedium ?? null,
        new Date().toISOString(),
      ],
    );
  },

  async loeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM bankkonto_zuordnung WHERE zugang_id = $1", [id]);
    await db.execute("DELETE FROM bankzugang WHERE id = $1", [id]);
  },
};

export const sqliteKontozuordnungRepository: KontozuordnungRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<ZuordnungZeile[]>(
      `SELECT zugang_id, schluessel, zahlungskonto_id, letzter_abruf_bis, bank_saldo, bank_saldo_datum
         FROM bankkonto_zuordnung`,
    );
    return zeilen.map((z) => ({
      zugangId: z.zugang_id,
      schluessel: z.schluessel,
      zahlungskontoId: z.zahlungskonto_id,
      letzterAbrufBis: z.letzter_abruf_bis ?? undefined,
      bankSaldo: z.bank_saldo ?? undefined,
      bankSaldoDatum: z.bank_saldo_datum ?? undefined,
    }));
  },

  async nachZugang(zugangId: string) {
    const db = await getDb();
    const zeilen = await db.select<ZuordnungZeile[]>(
      `SELECT zugang_id, schluessel, zahlungskonto_id, letzter_abruf_bis, bank_saldo, bank_saldo_datum
         FROM bankkonto_zuordnung WHERE zugang_id = $1`,
      [zugangId],
    );
    return zeilen.map((z) => ({
      zugangId: z.zugang_id,
      schluessel: z.schluessel,
      zahlungskontoId: z.zahlungskonto_id,
      letzterAbrufBis: z.letzter_abruf_bis ?? undefined,
      bankSaldo: z.bank_saldo ?? undefined,
      bankSaldoDatum: z.bank_saldo_datum ?? undefined,
    }));
  },

  async speichern(z: Kontozuordnung) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id, letzter_abruf_bis,
                                        bank_saldo, bank_saldo_datum)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(zugang_id, schluessel) DO UPDATE SET zahlungskonto_id  = excluded.zahlungskonto_id,
                                                       letzter_abruf_bis = excluded.letzter_abruf_bis,
                                                       bank_saldo        = excluded.bank_saldo,
                                                       bank_saldo_datum  = excluded.bank_saldo_datum`,
      [z.zugangId, z.schluessel, z.zahlungskontoId, z.letzterAbrufBis ?? null,
       z.bankSaldo ?? null, z.bankSaldoDatum ?? null],
    );
  },

  async loeschen(zugangId: string, schluessel: string) {
    const db = await getDb();
    await db.execute("DELETE FROM bankkonto_zuordnung WHERE zugang_id = $1 AND schluessel = $2", [
      zugangId,
      schluessel,
    ]);
  },
};
