// SQLite-Implementierung der Trainingsläufe.
//
// Konfiguration, Kennzahlen und Vorhersagen liegen als JSON in je einer Spalte. Gelesen
// werden sie immer ganz und nie gefiltert — eine eigene Tabelle je Vorhersage hiesse,
// bei jedem Lauf ein Fünftel des Bestands als Zeilen zu schreiben, die niemand einzeln
// abfragt.

import type { Trainingslauf } from "../../core";
import type { TrainingslaufRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  zeitpunkt: string;
  beispiele: number;
  konfiguration: string;
  kennzahlen: string | null;
  vorhersagen: string;
}

export const sqliteTrainingslaufRepository: TrainingslaufRepository = {
  async anlegen(lauf) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO trainingslauf (id, zeitpunkt, beispiele, konfiguration, kennzahlen, vorhersagen)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        lauf.id,
        lauf.zeitpunkt,
        lauf.beispiele,
        JSON.stringify(lauf.konfiguration),
        lauf.kennzahlen ? JSON.stringify(lauf.kennzahlen) : null,
        JSON.stringify(lauf.vorhersagen),
      ],
    );
  },

  async juengste(anzahl) {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      `SELECT id, zeitpunkt, beispiele, konfiguration, kennzahlen, vorhersagen
         FROM trainingslauf ORDER BY zeitpunkt DESC, id DESC LIMIT $1`,
      [anzahl],
    );
    return zeilen.map(
      (z): Trainingslauf => ({
        id: z.id,
        zeitpunkt: z.zeitpunkt,
        beispiele: z.beispiele,
        konfiguration: JSON.parse(z.konfiguration),
        kennzahlen: z.kennzahlen ? JSON.parse(z.kennzahlen) : undefined,
        vorhersagen: JSON.parse(z.vorhersagen),
      }),
    );
  },

  async ausduennen(behalten) {
    const db = await getDb();
    await db.execute(
      `DELETE FROM trainingslauf WHERE id NOT IN
         (SELECT id FROM trainingslauf ORDER BY zeitpunkt DESC, id DESC LIMIT $1)`,
      [behalten],
    );
  },
};
