// SQLite-Implementierung des RuecklagenRepository-Ports.
//
// Zwei Tabellen, EIN Aggregat — wie beim Budget: `ruecklage` trägt, was sich nicht datiert
// ändert, `ruecklage_rate` die Reihe der freien Raten (seit Migration 79). Anders als beim
// Budget schreibt `speichern` die Reihe NICHT mit; warum, steht am Port.

import type { Cent, Ruecklage, Ruecklagenart, Ruecklagenrate } from "../../core";
import type { RuecklagenAusbuchung, RuecklagenRepository } from "../../application/ports";
import { getDb } from "./db";

interface Zeile {
  id: string;
  bezeichnung: string;
  ziel: number | null;
  frist_monate: number | null;
  rate: number | null;
  beginn: string;
  kategorie_id: string | null;
  konto_id: string | null;
  beendet_am: string | null;
  art: string;
  findet_ab: string | null;
  kauf_datum: string | null;
  kauf_preis: number | null;
  nutzungsdauer_monate: number | null;
}

interface Ratenzeile {
  ruecklage_id: string;
  ab_monat: string;
  betrag: number;
}

interface AusbuchungsZeile {
  id: string;
  ruecklage_id: string;
  datum: string;
  betrag: number;
  istbuchung_id: string | null;
  notiz: string | null;
  zyklus_beginn: string | null;
  zyklus_ziel: number | null;
  zyklus_frist: number | null;
  zyklus_rate: number | null;
  bezeichnung: string | null;
  kategorie_id: string | null;
}

const SPALTEN =
  "id, bezeichnung, ziel, frist_monate, rate, beginn, kategorie_id, konto_id, beendet_am, art, findet_ab, kauf_datum, kauf_preis, nutzungsdauer_monate";

/**
 * Eine Zeile als Rücklage. `beendetAm` kommt mit; bei `alle()` ist es durch den Filter
 * ohnehin leer. `raten` ist immer eine Liste, auch eine leere: das Repository weiss, dass
 * es keine gibt, und sagt es — `undefined` hiesse „nicht gelesen".
 */
function ausZeile(z: Zeile, raten: readonly Ruecklagenrate[]): Ruecklage {
  return {
    id: z.id,
    bezeichnung: z.bezeichnung,
    ziel: z.ziel ?? undefined,
    fristMonate: z.frist_monate ?? undefined,
    rate: z.rate ?? undefined,
    beginn: z.beginn,
    kategorieId: z.kategorie_id ?? undefined,
    kontoId: z.konto_id ?? undefined,
    beendetAm: z.beendet_am ?? undefined,
    art: z.art as Ruecklagenart,
    findetAb: z.findet_ab ?? undefined,
    raten,
    // Nur vollständig — eine halbe Angabe (nur von Hand in der Datei möglich) zeigte einen
    // Wertverlust, den niemand so angegeben hat.
    ...(z.kauf_datum && z.kauf_preis != null && z.nutzungsdauer_monate != null
      ? { kauf: { datum: z.kauf_datum, preis: z.kauf_preis as Cent, nutzungsdauerMonate: z.nutzungsdauer_monate } }
      : {}),
  };
}

/**
 * Liest die Rücklagen der Auswahl samt ihrer Reihe. Beide Tabellen in einem Rutsch und
 * dann zusammengesetzt, wie beim Budget: eine Abfrage je Rücklage wäre N+1.
 */
async function lesen(bedingung: string, ordnung: string): Promise<Ruecklage[]> {
  const db = await getDb();
  const [zeilen, raten] = await Promise.all([
    db.select<Zeile[]>(`SELECT ${SPALTEN} FROM ruecklage WHERE ${bedingung} ORDER BY ${ordnung}`),
    db.select<Ratenzeile[]>("SELECT ruecklage_id, ab_monat, betrag FROM ruecklage_rate ORDER BY ruecklage_id, ab_monat"),
  ]);
  const jeRuecklage = new Map<string, Ruecklagenrate[]>();
  for (const r of raten) {
    const eintrag: Ruecklagenrate = { abMonat: r.ab_monat, betrag: r.betrag as Cent };
    const liste = jeRuecklage.get(r.ruecklage_id);
    if (liste) liste.push(eintrag);
    else jeRuecklage.set(r.ruecklage_id, [eintrag]);
  }
  return zeilen.map((z) => ausZeile(z, jeRuecklage.get(z.id) ?? []));
}

export const sqliteRuecklagenRepository: RuecklagenRepository = {
  async alle() {
    // Beendete (freie, ausgebuchte) Rücklagen bleiben in der Tabelle, sind aber für jede
    // laufende Rechnung nicht mehr da: keine Rate, kein Anspruch auf ein Konto, kein
    // Eintrag in der Liste. Der Filter steht HIER, damit kein Aufrufer ihn vergessen
    // kann; ihre Geschichte kommt über `ausbuchungen()`.
    return lesen("beendet_am IS NULL", "bezeichnung");
  },
  async beendete() {
    return lesen("beendet_am IS NOT NULL", "beendet_am DESC, bezeichnung");
  },
  async speichern(r: Ruecklage) {
    const db = await getDb();
    // `art` über COALESCE: fehlt sie, gilt bei einer neuen Zeile die Vorgabe der Spalte
    // und bei einer bestehenden die gespeicherte (Begründung am Port). Die Reihe bleibt
    // unberührt.
    //
    // Der Wert steht zweimal in der Liste ($10 und $15) statt einmal zweimal benutzt: die
    // Naht zur Shell bindet der Reihe nach (`src-tauri/src/datenbank.rs`), und ob ein
    // wiederholter Platzhalter dort denselben Wert bekommt, prüft kein Test hier. Aus
    // demselben Grund stehen die Platzhalter im Text aufsteigend.
    //
    // Kauf und Nutzungsdauer (Migration 82) schreibt jedes Speichern mit: wer die
    // Rücklage weiterreicht (`{ ...r, beginn }` beim Abschliessen), reicht sie mit.
    await db.execute(
      `INSERT INTO ruecklage (id, bezeichnung, ziel, frist_monate, rate, beginn, kategorie_id, konto_id, beendet_am, art, findet_ab,
                              kauf_datum, kauf_preis, nutzungsdauer_monate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'abschliessend'),$11,$12,$13,$14)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung,
         ziel = excluded.ziel, frist_monate = excluded.frist_monate, rate = excluded.rate,
         beginn = excluded.beginn, kategorie_id = excluded.kategorie_id,
         konto_id = excluded.konto_id, beendet_am = excluded.beendet_am,
         kauf_datum = excluded.kauf_datum, kauf_preis = excluded.kauf_preis,
         nutzungsdauer_monate = excluded.nutzungsdauer_monate,
         art = COALESCE($15, ruecklage.art), findet_ab = excluded.findet_ab`,
      [
        r.id, r.bezeichnung, r.ziel ?? null, r.fristMonate ?? null, r.rate ?? null, r.beginn,
        r.kategorieId ?? null, r.kontoId ?? null, r.beendetAm ?? null, r.art ?? null, r.findetAb ?? null,
        r.kauf?.datum ?? null, r.kauf?.preis ?? null, r.kauf?.nutzungsdauerMonate ?? null,
        r.art ?? null,
      ],
    );
  },
  async rateSpeichern(ruecklageId: string, rate: Ruecklagenrate) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO ruecklage_rate (ruecklage_id, ab_monat, betrag) VALUES ($1,$2,$3)
       ON CONFLICT(ruecklage_id, ab_monat) DO UPDATE SET betrag = excluded.betrag`,
      [ruecklageId, rate.abMonat, rate.betrag],
    );
  },
  async rateLoeschen(ruecklageId: string, abMonat: string) {
    const db = await getDb();
    await db.execute("DELETE FROM ruecklage_rate WHERE ruecklage_id = $1 AND ab_monat = $2", [ruecklageId, abMonat]);
  },
  async loeschen(id: string) {
    const db = await getDb();
    // Reihe und Zuordnungen hängen per CASCADE daran. Im Test sind Fremdschlüssel aber AUS
    // (`persistence/CLAUDE.md`), und eine verwaiste Zeile wäre dort unsichtbar — deshalb
    // ausdrücklich zuerst, wie beim Budget. Die Ausbuchungen bleiben dem CASCADE
    // überlassen, so wie bisher.
    await db.execute("DELETE FROM ruecklage_rate WHERE ruecklage_id = $1", [id]);
    await db.execute("DELETE FROM ruecklage_zuordnung WHERE ruecklage_id = $1", [id]);
    await db.execute("DELETE FROM ruecklage WHERE id = $1", [id]);
  },
  async ausbuchungSpeichern(a: RuecklagenAusbuchung) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO ruecklage_ausbuchung
         (id, ruecklage_id, datum, betrag, istbuchung_id, notiz, zyklus_beginn, zyklus_ziel, zyklus_frist, zyklus_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(id) DO UPDATE SET datum = excluded.datum, betrag = excluded.betrag,
         istbuchung_id = excluded.istbuchung_id, notiz = excluded.notiz,
         zyklus_beginn = excluded.zyklus_beginn, zyklus_ziel = excluded.zyklus_ziel,
         zyklus_frist = excluded.zyklus_frist, zyklus_rate = excluded.zyklus_rate`,
      [
        a.id, a.ruecklageId, a.datum, a.betrag, a.istbuchungId ?? null, a.notiz ?? null,
        a.zyklusBeginn ?? null, a.zyklusZiel ?? null, a.zyklusFrist ?? null, a.zyklusRate ?? null,
      ],
    );
  },
  async ausbuchungen() {
    const db = await getDb();
    const zeilen = await db.select<AusbuchungsZeile[]>(
      // Bezeichnung und Kategorie kommen aus der Rücklage mit: die Ausbuchung ist die
      // einzige Spur einer beendeten Rücklage, und ohne Namen wäre ihr Posten in der
      // Ergebnisrechnung eine Zahl ohne Zeile.
      `SELECT a.id, a.ruecklage_id, a.datum, a.betrag, a.istbuchung_id, a.notiz,
              a.zyklus_beginn, a.zyklus_ziel, a.zyklus_frist, a.zyklus_rate,
              r.bezeichnung, r.kategorie_id
         FROM ruecklage_ausbuchung a LEFT JOIN ruecklage r ON r.id = a.ruecklage_id
        ORDER BY a.datum DESC`,
    );
    return zeilen.map((z) => ({
      id: z.id,
      ruecklageId: z.ruecklage_id,
      datum: z.datum,
      betrag: z.betrag,
      istbuchungId: z.istbuchung_id ?? undefined,
      notiz: z.notiz ?? undefined,
      zyklusBeginn: z.zyklus_beginn ?? undefined,
      zyklusZiel: z.zyklus_ziel ?? undefined,
      zyklusFrist: z.zyklus_frist ?? undefined,
      zyklusRate: z.zyklus_rate ?? undefined,
      bezeichnung: z.bezeichnung ?? undefined,
      kategorieId: z.kategorie_id ?? undefined,
    }));
  },
};
