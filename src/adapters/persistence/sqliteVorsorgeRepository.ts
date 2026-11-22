// SQLite für das Vorsorgeziel (Migration 78).
//
// Zwei Tabellen hinter einem Port: der Stammsatz (`vorsorgeziel`) und die Reihe seiner
// Annahmen (`vorsorgeziel_annahme`), gültig ab einem Monat — aufgebaut wie Budget und
// `budget_betrag`.

import type { Vorsorgeziel, Vorsorgezielannahme } from "../../core";
import type { VorsorgeRepository } from "../../application/ports";
import { getDb } from "./db";

interface ZielZeile {
  id: string;
  bezeichnung: string;
}

interface AnnahmeZeile {
  ziel_id: string;
  ab_monat: string;
  ziel_monat: string;
  wunsch_monatlich: number;
  rente_monatlich: number;
  entnahme_monate: number;
  rendite_bp: number;
}

export const sqliteVorsorgeRepository: VorsorgeRepository = {
  async ziele() {
    const db = await getDb();
    const zeilen = await db.select<ZielZeile[]>(
      // Nach dem Anlegen sortiert: die Oberfläche führt für den Anfang EIN Ziel und nimmt
      // das erste. Die Reihenfolge darf deshalb nicht vom Namen abhängen.
      "SELECT id, bezeichnung FROM vorsorgeziel ORDER BY erfasst_am, id",
    );
    return zeilen.map((z): Vorsorgeziel => ({ id: z.id, bezeichnung: z.bezeichnung }));
  },

  async zielSpeichern(ziel: Vorsorgeziel, erfasstAm: string) {
    const db = await getDb();
    await db.execute(
      // `erfasst_am` bleibt beim Ändern stehen: es sagt, seit wann es das Ziel gibt.
      `INSERT INTO vorsorgeziel (id, bezeichnung, erfasst_am) VALUES ($1, $2, $3)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung`,
      [ziel.id, ziel.bezeichnung, erfasstAm],
    );
  },

  async zielLoeschen(id: string) {
    const db = await getDb();
    // Von Hand, was in der App die Fremdschlüssel täten (CASCADE, SET NULL): sql.js hat
    // sie aus, und ein Test, der nur dank der App-Einstellung stimmt, prüft nichts.
    await db.execute("DELETE FROM vorsorgeziel_annahme WHERE ziel_id = $1", [id]);
    await db.execute(
      "UPDATE vermoegensgegenstand SET vorsorgeziel_id = NULL WHERE vorsorgeziel_id = $1",
      [id],
    );
    await db.execute("UPDATE depot SET vorsorgeziel_id = NULL WHERE vorsorgeziel_id = $1", [id]);
    await db.execute("DELETE FROM vorsorgeziel WHERE id = $1", [id]);
  },

  async annahmen() {
    const db = await getDb();
    const zeilen = await db.select<AnnahmeZeile[]>(
      `SELECT ziel_id, ab_monat, ziel_monat, wunsch_monatlich, rente_monatlich,
              entnahme_monate, rendite_bp
         FROM vorsorgeziel_annahme ORDER BY ziel_id, ab_monat`,
    );
    return zeilen.map(
      (z): Vorsorgezielannahme => ({
        zielId: z.ziel_id,
        abMonat: z.ab_monat,
        zielMonat: z.ziel_monat,
        wunschMonatlich: z.wunsch_monatlich,
        renteMonatlich: z.rente_monatlich,
        entnahmeMonate: z.entnahme_monate,
        renditeBp: z.rendite_bp,
      }),
    );
  },

  async annahmeSpeichern(a: Vorsorgezielannahme) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO vorsorgeziel_annahme
         (ziel_id, ab_monat, ziel_monat, wunsch_monatlich, rente_monatlich, entnahme_monate, rendite_bp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(ziel_id, ab_monat) DO UPDATE SET
         ziel_monat       = excluded.ziel_monat,
         wunsch_monatlich = excluded.wunsch_monatlich,
         rente_monatlich  = excluded.rente_monatlich,
         entnahme_monate  = excluded.entnahme_monate,
         rendite_bp       = excluded.rendite_bp`,
      [a.zielId, a.abMonat, a.zielMonat, a.wunschMonatlich, a.renteMonatlich, a.entnahmeMonate, a.renditeBp],
    );
  },
};
