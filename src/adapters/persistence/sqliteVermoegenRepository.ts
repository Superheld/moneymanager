// SQLite für das Vermögen (Migration 77).
//
// Vier Tabellen hinter einem Port: zwei Stammsätze (`vermoegensgegenstand`,
// `verbindlichkeit`) und je eine Reihe von Beobachtungen (`vermoegenswert`,
// `verbindlichkeit_stand`). Aufgebaut wie das Depot-Repository, mit einem Unterschied:
// eine Beobachtung wird EINGETRAGEN, nicht gespeichert — ein zweiter Betrag zum selben
// Stichtag scheitert am Primärschlüssel, statt den ersten still zu ersetzen.

import type {
  Verbindlichkeit,
  Verbindlichkeitsart,
  Verbindlichkeitsstand,
  Vermoegensart,
  Vermoegensgegenstand,
  Vermoegenswert,
} from "../../core";
import type { VermoegenRepository } from "../../application/ports";
import { getDb } from "./db";

interface GegenstandZeile {
  id: string;
  bezeichnung: string;
  art: string;
  aktiv: number;
}

interface WertZeile {
  gegenstand_id: string;
  stichtag: string;
  wert: number;
}

interface VerbindlichkeitZeile {
  id: string;
  bezeichnung: string;
  art: string;
  vertrag_id: string | null;
  gegenstand_id: string | null;
  aktiv: number;
}

interface StandZeile {
  verbindlichkeit_id: string;
  stichtag: string;
  restschuld: number;
}

export const sqliteVermoegenRepository: VermoegenRepository = {
  async gegenstaende() {
    const db = await getDb();
    const zeilen = await db.select<GegenstandZeile[]>(
      // Stillgelegte kommen MIT: ihre Reihe gehört in den Verlauf, und die Liste zeigt
      // sie gedämpft. Wer sie nicht zählen will, fragt `wirdGefuehrt` — die Regel dazu
      // steht im Kern und nicht in einem Filter, den ein zweiter Leseweg vergässe.
      "SELECT id, bezeichnung, art, aktiv FROM vermoegensgegenstand ORDER BY bezeichnung",
    );
    return zeilen.map((z) => ({
      id: z.id,
      bezeichnung: z.bezeichnung,
      art: z.art as Vermoegensart,
      aktiv: z.aktiv !== 0,
    }));
  },

  async gegenstandSpeichern(g: Vermoegensgegenstand) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO vermoegensgegenstand (id, bezeichnung, art, aktiv)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung,
                                     art         = excluded.art,
                                     aktiv       = excluded.aktiv`,
      [g.id, g.bezeichnung, g.art, g.aktiv === false ? 0 : 1],
    );
  },

  async gegenstandLoeschen(id: string) {
    const db = await getDb();
    // Von Hand, was in der App die Fremdschlüssel täten (CASCADE, SET NULL): sql.js hat
    // sie aus, und ein Test, der nur dank der App-Einstellung stimmt, prüft nichts.
    await db.execute("DELETE FROM vermoegenswert WHERE gegenstand_id = $1", [id]);
    await db.execute("UPDATE verbindlichkeit SET gegenstand_id = NULL WHERE gegenstand_id = $1", [
      id,
    ]);
    await db.execute("DELETE FROM vermoegensgegenstand WHERE id = $1", [id]);
  },

  async werte() {
    const db = await getDb();
    const zeilen = await db.select<WertZeile[]>(
      "SELECT gegenstand_id, stichtag, wert FROM vermoegenswert ORDER BY gegenstand_id, stichtag",
    );
    return zeilen.map((z) => ({
      gegenstandId: z.gegenstand_id,
      stichtag: z.stichtag,
      wert: z.wert,
    }));
  },

  async wertEintragen(w: Vermoegenswert, erfasstAm: string) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO vermoegenswert (gegenstand_id, stichtag, wert, erfasst_am)
       VALUES ($1, $2, $3, $4)`,
      [w.gegenstandId, w.stichtag, w.wert, erfasstAm],
    );
  },

  async wertEntfernen(gegenstandId: string, stichtag: string) {
    const db = await getDb();
    await db.execute("DELETE FROM vermoegenswert WHERE gegenstand_id = $1 AND stichtag = $2", [
      gegenstandId,
      stichtag,
    ]);
  },

  async verbindlichkeiten() {
    const db = await getDb();
    const zeilen = await db.select<VerbindlichkeitZeile[]>(
      "SELECT id, bezeichnung, art, vertrag_id, gegenstand_id, aktiv FROM verbindlichkeit ORDER BY bezeichnung",
    );
    return zeilen.map((z) => ({
      id: z.id,
      bezeichnung: z.bezeichnung,
      art: z.art as Verbindlichkeitsart,
      vertragId: z.vertrag_id ?? undefined,
      gegenstandId: z.gegenstand_id ?? undefined,
      aktiv: z.aktiv !== 0,
    }));
  },

  async verbindlichkeitSpeichern(v: Verbindlichkeit) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO verbindlichkeit (id, bezeichnung, art, vertrag_id, gegenstand_id, aktiv)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET bezeichnung   = excluded.bezeichnung,
                                     art           = excluded.art,
                                     vertrag_id    = excluded.vertrag_id,
                                     gegenstand_id = excluded.gegenstand_id,
                                     aktiv         = excluded.aktiv`,
      [
        v.id,
        v.bezeichnung,
        v.art,
        v.vertragId ?? null,
        v.gegenstandId ?? null,
        v.aktiv === false ? 0 : 1,
      ],
    );
  },

  async verbindlichkeitLoeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM verbindlichkeit_stand WHERE verbindlichkeit_id = $1", [id]);
    await db.execute("DELETE FROM verbindlichkeit WHERE id = $1", [id]);
  },

  async staende() {
    const db = await getDb();
    const zeilen = await db.select<StandZeile[]>(
      "SELECT verbindlichkeit_id, stichtag, restschuld FROM verbindlichkeit_stand ORDER BY verbindlichkeit_id, stichtag",
    );
    return zeilen.map((z) => ({
      verbindlichkeitId: z.verbindlichkeit_id,
      stichtag: z.stichtag,
      restschuld: z.restschuld,
    }));
  },

  async standEintragen(s: Verbindlichkeitsstand, erfasstAm: string) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO verbindlichkeit_stand (verbindlichkeit_id, stichtag, restschuld, erfasst_am)
       VALUES ($1, $2, $3, $4)`,
      [s.verbindlichkeitId, s.stichtag, s.restschuld, erfasstAm],
    );
  },

  async standEntfernen(verbindlichkeitId: string, stichtag: string) {
    const db = await getDb();
    await db.execute(
      "DELETE FROM verbindlichkeit_stand WHERE verbindlichkeit_id = $1 AND stichtag = $2",
      [verbindlichkeitId, stichtag],
    );
  },
};
