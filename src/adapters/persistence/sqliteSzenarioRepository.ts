// SQLite-Implementierung des SzenarioRepository-Ports. Posten liegen in einer eigenen
// Tabelle (szenario_posten), strikt getrennt von der Plan-Tabelle zahlungsregel.

import type { Charakter, Rhythmus, Szenario, Zahlungsregel } from "../../core";
import type { SzenarioRepository } from "../../application/ports";
import { getDb } from "./db";

interface PostenZeile {
  id: string;
  bezeichnung: string;
  betrag: number;
  rhythmus: string;
  startdatum: string;
  charakter: string;
}

export const sqliteSzenarioRepository: SzenarioRepository = {
  async alle() {
    const db = await getDb();
    return db.select<Szenario[]>("SELECT id, name FROM szenario ORDER BY name");
  },

  async speichern(s: Szenario) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO szenario (id, name) VALUES ($1,$2)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      [s.id, s.name],
    );
  },

  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM szenario_posten WHERE szenario_id = $1", [id]);
    await db.execute("DELETE FROM szenario WHERE id = $1", [id]);
  },

  async posten(szenarioId) {
    const db = await getDb();
    const zeilen = await db.select<PostenZeile[]>(
      "SELECT id, bezeichnung, betrag, rhythmus, startdatum, charakter FROM szenario_posten WHERE szenario_id = $1 ORDER BY startdatum",
      [szenarioId],
    );
    return zeilen.map<Zahlungsregel>((z) => ({
      id: z.id,
      bezeichnung: z.bezeichnung,
      betrag: z.betrag,
      rhythmus: z.rhythmus as Rhythmus,
      startdatum: z.startdatum,
      charakter: z.charakter as Charakter,
    }));
  },

  async postenSpeichern(szenarioId, p) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO szenario_posten (id, szenario_id, bezeichnung, betrag, rhythmus, startdatum, charakter)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung, betrag = excluded.betrag,
         rhythmus = excluded.rhythmus, startdatum = excluded.startdatum, charakter = excluded.charakter`,
      [p.id, szenarioId, p.bezeichnung, p.betrag, p.rhythmus, p.startdatum, p.charakter],
    );
  },

  async postenLoeschen(postenId) {
    const db = await getDb();
    await db.execute("DELETE FROM szenario_posten WHERE id = $1", [postenId]);
  },
};
