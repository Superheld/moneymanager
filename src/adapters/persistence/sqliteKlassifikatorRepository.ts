// SQLite-Implementierung des Klassifikator-Ports — das trainierte Modell der
// automatischen Kategorisierung.
//
// Genau eine Zeile mit fester Id: es gibt ein aktuelles Modell, ein Training ersetzt es.
// Die Gewichte sind eine Float32-Matrix (Kategorien × Merkmale) und werden als base64
// abgelegt. Alternativen wären eine Zeile je Gewicht (bei ~2000 Merkmalen × ~50
// Kategorien 100.000 Zeilen, die niemand einzeln liest) oder JSON-Zahlen (rund das
// Dreifache an Platz und ein Rundungsrisiko beim Hin- und Herwandeln). Base64 über den
// rohen Float32-Puffer ist verlustfrei und kompakt.

import type { Modell } from "../../core";
import type { KlassifikatorRepository, Modellstand } from "../../application/ports";
import { getDb } from "./db";

/** Es gibt genau ein Modell — die Id ist Konstante, kein Schlüssel. */
const ID = "aktuell";

/** Trennzeichen der Wortlisten: in Merkmalen und Kategorie-Ids kommt es nicht vor. */
const TRENNER = "\n";

interface Zeile {
  kategorien: string;
  vokabular: string;
  gewichte: string;
  bias: string;
  beispiele: number;
  trainiert_am: string;
  genauigkeit: number | null;
}

/** Float32Array → base64. Blockweise, weil `String.fromCharCode` mit ~400.000 Argumenten bricht. */
export function alsBase64(werte: Float32Array): string {
  const bytes = new Uint8Array(werte.buffer, werte.byteOffset, werte.byteLength);
  let roh = "";
  const BLOCK = 8192;
  for (let i = 0; i < bytes.length; i += BLOCK) {
    roh += String.fromCharCode(...bytes.subarray(i, i + BLOCK));
  }
  return btoa(roh);
}

/** base64 → Float32Array. */
export function ausBase64(text: string): Float32Array {
  if (!text) return new Float32Array(0);
  const roh = atob(text);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  // Über den Puffer und nicht per `new Float32Array(bytes)` — sonst würden die Bytes
  // einzeln als Zahlen übernommen statt als Gleitkommazahlen gelesen.
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/** Eine Liste, die auch leer sein darf: `"".split()` ergäbe sonst `[""]`. */
const alsListe = (text: string): string[] => (text ? text.split(TRENNER) : []);

export const sqliteKlassifikatorRepository: KlassifikatorRepository = {
  async laden() {
    const db = await getDb();
    const zeilen = await db.select<Zeile[]>(
      `SELECT kategorien, vokabular, gewichte, bias, beispiele, trainiert_am, genauigkeit
         FROM klassifikator_modell WHERE id = $1`,
      [ID],
    );
    const z = zeilen[0];
    if (!z) return null;

    const modell: Modell = {
      kategorien: alsListe(z.kategorien),
      vokabular: alsListe(z.vokabular),
      gewichte: ausBase64(z.gewichte),
      bias: ausBase64(z.bias),
      beispiele: z.beispiele,
    };
    return {
      modell,
      trainiertAm: z.trainiert_am,
      genauigkeit: z.genauigkeit ?? undefined,
    };
  },

  async speichern(stand: Modellstand) {
    const db = await getDb();
    const m = stand.modell;
    await db.execute(
      `INSERT INTO klassifikator_modell
         (id, kategorien, vokabular, gewichte, bias, beispiele, trainiert_am, genauigkeit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(id) DO UPDATE SET kategorien = excluded.kategorien,
         vokabular = excluded.vokabular, gewichte = excluded.gewichte, bias = excluded.bias,
         beispiele = excluded.beispiele, trainiert_am = excluded.trainiert_am,
         genauigkeit = excluded.genauigkeit`,
      [
        ID,
        m.kategorien.join(TRENNER),
        m.vokabular.join(TRENNER),
        alsBase64(m.gewichte),
        alsBase64(m.bias),
        m.beispiele,
        stand.trainiertAm,
        stand.genauigkeit ?? null,
      ],
    );
  },
};
