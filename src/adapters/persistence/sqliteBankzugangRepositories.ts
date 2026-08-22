// SQLite-Implementierung für Bankzugänge und Konto-Zuordnungen (Migrationen 26 und 37).
//
// Was hier NICHT liegt: die PIN. Sie wird pro Sitzung eingegeben, durchgereicht und
// vergessen — deshalb kommt sie in keiner Spalte und in keinem Parameter dieser Datei vor.

import type { Bankzugang } from "../../application/fints/abrufPort";
import type {
  BankzugangRepository,
  Formatwahl,
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
  profil: string | null;
}

interface ZuordnungZeile {
  zugang_id: string;
  schluessel: string;
  zahlungskonto_id: string;
  letzter_abruf_bis: string | null;
  letztes_format: string | null;
  format_wahl: string | null;
}

export const sqliteBankzugangRepository: BankzugangRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<ZugangZeile[]>(
      `SELECT id, bezeichnung, url, blz, benutzer, kunden_id, bankparameter,
              tan_verfahren_id, tan_medium, profil
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
      profil: z.profil ?? undefined,
    }));
  },

  async speichern(z: Bankzugang) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO bankzugang (id, bezeichnung, url, blz, benutzer, kunden_id, bankparameter,
                               tan_verfahren_id, tan_medium, profil, angelegt_am)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT(id) DO UPDATE SET bezeichnung      = excluded.bezeichnung,
                                     url              = excluded.url,
                                     blz              = excluded.blz,
                                     benutzer         = excluded.benutzer,
                                     kunden_id        = excluded.kunden_id,
                                     bankparameter    = excluded.bankparameter,
                                     tan_verfahren_id = excluded.tan_verfahren_id,
                                     tan_medium       = excluded.tan_medium,
                                     profil           = excluded.profil`,
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
        z.profil ?? null,
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
      `SELECT zugang_id, schluessel, zahlungskonto_id, letzter_abruf_bis, letztes_format, format_wahl
         FROM bankkonto_zuordnung`,
    );
    return zeilen.map((z) => ({
      zugangId: z.zugang_id,
      schluessel: z.schluessel,
      zahlungskontoId: z.zahlungskonto_id,
      letzterAbrufBis: z.letzter_abruf_bis ?? undefined,
      letztesFormat: z.letztes_format ?? undefined,
      formatwahl: (z.format_wahl as Formatwahl | null) ?? undefined,
    }));
  },

  async nachZugang(zugangId: string) {
    const db = await getDb();
    const zeilen = await db.select<ZuordnungZeile[]>(
      `SELECT zugang_id, schluessel, zahlungskonto_id, letzter_abruf_bis, letztes_format, format_wahl
         FROM bankkonto_zuordnung WHERE zugang_id = $1`,
      [zugangId],
    );
    return zeilen.map((z) => ({
      zugangId: z.zugang_id,
      schluessel: z.schluessel,
      zahlungskontoId: z.zahlungskonto_id,
      letzterAbrufBis: z.letzter_abruf_bis ?? undefined,
      letztesFormat: z.letztes_format ?? undefined,
      formatwahl: (z.format_wahl as Formatwahl | null) ?? undefined,
    }));
  },

  async speichern(z: Kontozuordnung) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO bankkonto_zuordnung (zugang_id, schluessel, zahlungskonto_id, letzter_abruf_bis,
                                        letztes_format, format_wahl)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(zugang_id, schluessel) DO UPDATE SET zahlungskonto_id  = excluded.zahlungskonto_id,
                                                       letzter_abruf_bis = excluded.letzter_abruf_bis,
                                                       letztes_format    = excluded.letztes_format,
                                                       format_wahl       = excluded.format_wahl`,
      [
        z.zugangId,
        z.schluessel,
        z.zahlungskontoId,
        z.letzterAbrufBis ?? null,
        z.letztesFormat ?? null,
        // „automatisch" ist die Abwesenheit einer Festlegung und wird als NULL abgelegt —
        // sonst stünde derselbe Zustand in zwei Schreibweisen in der Tabelle.
        z.formatwahl && z.formatwahl !== "automatisch" ? z.formatwahl : null,
      ],
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
