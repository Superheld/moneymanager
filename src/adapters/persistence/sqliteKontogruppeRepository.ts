// SQLite-Implementierung des Kontogruppen-Ports.
//
// Die Mitglieder stehen in einer eigenen Tabelle (`kontogruppe_konto`), nicht als JSON an
// der Gruppe: so raeumt ein geloeschtes Konto seine Mitgliedschaften per Fremdschluessel
// mit ab. Beim Speichern wird die Mitgliederliste deshalb ERSETZT und nicht ergaenzt —
// die Gruppe, die hereinkommt, ist der ganze Stand.

import type { Kontogruppe } from "../../core";
import type { KontogruppeRepository } from "../../application/ports";
import { getDb } from "./db";

export const sqliteKontogruppeRepository: KontogruppeRepository = {
  async alle() {
    const db = await getDb();
    const gruppen = await db.select<{ id: string; bezeichnung: string }[]>(
      "SELECT id, bezeichnung FROM kontogruppe ORDER BY bezeichnung",
    );
    const mitglieder = await db.select<{ gruppe_id: string; konto_id: string }[]>(
      "SELECT gruppe_id, konto_id FROM kontogruppe_konto",
    );
    const jeGruppe = new Map<string, string[]>();
    for (const m of mitglieder) {
      const liste = jeGruppe.get(m.gruppe_id);
      if (liste) liste.push(m.konto_id);
      else jeGruppe.set(m.gruppe_id, [m.konto_id]);
    }
    return gruppen.map(
      (g): Kontogruppe => ({
        id: g.id,
        bezeichnung: g.bezeichnung,
        kontoIds: jeGruppe.get(g.id) ?? [],
      }),
    );
  },

  async speichern(g: Kontogruppe) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO kontogruppe (id, bezeichnung) VALUES ($1, $2)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung`,
      [g.id, g.bezeichnung],
    );
    // Erst raeumen, dann schreiben: ein entferntes Konto verschwindet sonst nie wieder
    // aus der Gruppe, und die Liste waechst mit jeder Bearbeitung.
    await db.execute("DELETE FROM kontogruppe_konto WHERE gruppe_id = $1", [g.id]);
    for (const kontoId of g.kontoIds) {
      await db.execute(
        "INSERT OR IGNORE INTO kontogruppe_konto (gruppe_id, konto_id) VALUES ($1, $2)",
        [g.id, kontoId],
      );
    }
  },

  async loeschen(id: string) {
    const db = await getDb();
    // Die Mitgliedschaften gehen per ON DELETE CASCADE mit — sofern die Fremdschluessel
    // an sind. Sie hier trotzdem selbst zu raeumen kostet nichts und macht die Absicht
    // im Code sichtbar, statt sie einer Pragma-Einstellung zu ueberlassen.
    await db.execute("DELETE FROM kontogruppe_konto WHERE gruppe_id = $1", [id]);
    await db.execute("DELETE FROM kontogruppe WHERE id = $1", [id]);
  },
};
