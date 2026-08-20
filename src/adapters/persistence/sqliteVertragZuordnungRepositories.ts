// SQLite-Implementierungen der beiden Zuordnungs-Ports (Migration 19):
// die Erkennungsregel je Vertrag und die Zuordnung je Ist-Buchung.
//
// Die Merkmale liegen als JSON-Textspalte — dasselbe Muster wie `inhaber_ids` beim
// Zahlungskonto. Eine eigene Zeilen-Tabelle wäre sauberer normalisiert und hier reine
// Zeremonie: die Liste hat zwei bis drei Einträge, wird immer vollständig gelesen und
// vollständig geschrieben.
//
// Die Spalte heißt noch `schluessel`, obwohl sie inzwischen typisierte Merkmale trägt.
// Bewusst so gelassen: ein RENAME COLUMN wäre beim zweiten Lauf ein Fehler, und
// Migrationen müssen hier wiederholbar sein (siehe CLAUDE.md). Der Name der Spalte kostet
// nichts, ein nicht wiederholbares Statement schon.

import type {
  Erkennungsmerkmal,
  Vertragserkennung,
  Vertragszuordnung,
  Zuordnungsherkunft,
} from "../../core";
import type {
  VertragserkennungRepository,
  VertragszuordnungRepository,
} from "../../application/ports";
import type { AbgleichDeps } from "../../application/vertraege/vertragszuordnung";
import { getDb } from "./db";
import { sqliteLedgerRepository } from "./sqliteLedgerRepository";
import { sqliteUmsatzRepository } from "./sqliteImportRepositories";

interface ErkennungZeile {
  vertrag_id: string;
  schluessel: string;
  betrag_von: number | null;
  betrag_bis: number | null;
  gueltig_ab: string | null;
  gueltig_bis: string | null;
  konto_id: string | null;
}

/**
 * Sieht dieser Text nach einer SEPA-Gläubiger-ID aus? Zwei Buchstaben Land, zwei
 * Prüfziffern, „ZZZ" als Geschäftsbereich, dann die Kennung — z. B. „DE98ZZZ09999999999".
 * Nur für den Altformat-Leser unten gebraucht; im laufenden Betrieb sagt die Art, was ein
 * Merkmal ist, statt dass jemand es errät.
 */
const SIEHT_AUS_WIE_GLAEUBIGER_ID = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/;

/**
 * JSON-Spalte → Merkmale. Liest ZWEI Formate:
 *
 *  • aktuell: `[{"art":"empfaenger","muster":"vibora"}, …]`
 *  • Altbestand: `["vibora", "DE98ZZZ…"]` — eine flache Schlüsselliste ohne Art. Die
 *    Regeln aus Migration 19 stehen so in der Datenbank; ihre Art wird an der Form des
 *    Werts erraten. Das ist die einzige Stelle, an der geraten wird, und sie verschwindet,
 *    sobald die betroffenen Regeln einmal gespeichert wurden. Eine Migration hätte dafür
 *    ein JSON-Array in SQL umbauen müssen — nicht wiederholbar zu bekommen, und die Regel
 *    für Migrationen lautet: jedes Statement muss wiederholbar sein.
 *
 * Defensiv im Übrigen: ein kaputter Eintrag darf die Vertragsliste nicht ausfallen lassen.
 */
function parseMerkmale(json: string): Erkennungsmerkmal[] {
  let gelesen: unknown;
  try {
    gelesen = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(gelesen)) return [];
  return gelesen.flatMap((eintrag): Erkennungsmerkmal[] => {
    if (typeof eintrag === "string") {
      const wert = eintrag.trim();
      if (!wert) return [];
      return [{ art: SIEHT_AUS_WIE_GLAEUBIGER_ID.test(wert) ? "glaeubigerId" : "empfaenger", muster: wert }];
    }
    if (eintrag && typeof eintrag === "object") {
      const { art, muster } = eintrag as { art?: unknown; muster?: unknown };
      if (typeof muster === "string" && (art === "glaeubigerId" || art === "empfaenger")) {
        return [{ art, muster }];
      }
    }
    return [];
  });
}

export const sqliteVertragserkennungRepository: VertragserkennungRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<ErkennungZeile[]>(
      `SELECT vertrag_id, schluessel, betrag_von, betrag_bis, gueltig_ab, gueltig_bis, konto_id
       FROM vertrag_erkennung`,
    );
    return zeilen.map((z): Vertragserkennung => ({
      vertragId: z.vertrag_id,
      merkmale: parseMerkmale(z.schluessel),
      betragVon: z.betrag_von ?? undefined,
      betragBis: z.betrag_bis ?? undefined,
      gueltigAb: z.gueltig_ab ?? undefined,
      gueltigBis: z.gueltig_bis ?? undefined,
      kontoId: z.konto_id ?? undefined,
    }));
  },

  async speichern(e) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO vertrag_erkennung (vertrag_id, schluessel, betrag_von, betrag_bis, gueltig_ab, gueltig_bis, konto_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(vertrag_id) DO UPDATE SET
         schluessel = excluded.schluessel, betrag_von = excluded.betrag_von,
         betrag_bis = excluded.betrag_bis, gueltig_ab = excluded.gueltig_ab,
         gueltig_bis = excluded.gueltig_bis, konto_id = excluded.konto_id`,
      [
        e.vertragId,
        JSON.stringify(e.merkmale),
        e.betragVon ?? null,
        e.betragBis ?? null,
        e.gueltigAb ?? null,
        e.gueltigBis ?? null,
        e.kontoId ?? null,
      ],
    );
  },

  async loeschen(vertragId) {
    const db = await getDb();
    await db.execute("DELETE FROM vertrag_erkennung WHERE vertrag_id = $1", [vertragId]);
  },
};

interface ZuordnungZeile {
  istbuchung_id: string;
  vertrag_id: string | null;
  herkunft: string;
}

export const sqliteVertragszuordnungRepository: VertragszuordnungRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<ZuordnungZeile[]>(
      "SELECT istbuchung_id, vertrag_id, herkunft FROM vertrag_zuordnung",
    );
    return zeilen.map((z): Vertragszuordnung => ({
      istbuchungId: z.istbuchung_id,
      // NULL bleibt null und wird NICHT zu undefined: es ist die Aussage „gehört zu
      // keinem Vertrag", nicht ein fehlender Wert.
      vertragId: z.vertrag_id,
      herkunft: z.herkunft as Zuordnungsherkunft,
    }));
  },

  async speichern(z) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO vertrag_zuordnung (istbuchung_id, vertrag_id, herkunft) VALUES ($1,$2,$3)
       ON CONFLICT(istbuchung_id) DO UPDATE SET
         vertrag_id = excluded.vertrag_id, herkunft = excluded.herkunft`,
      [z.istbuchungId, z.vertragId, z.herkunft],
    );
  },

  async loeschen(istbuchungId) {
    const db = await getDb();
    await db.execute("DELETE FROM vertrag_zuordnung WHERE istbuchung_id = $1", [istbuchungId]);
  },
};

/**
 * Die vier Repositories, die der Zuordnungs-Abgleich braucht, einmal verdrahtet.
 *
 * Der Abgleich wird von mehreren Stellen ausgelöst (Vertrag gespeichert, Vertrag
 * gelöscht, Import verbucht, Handentscheidung zurückgenommen) — jede von ihnen dieselbe
 * Vierergruppe zusammenstellen zu lassen, wäre vier Gelegenheiten, eine zu vertauschen.
 */
export const vertragsAbgleichDeps: AbgleichDeps = {
  ledger: sqliteLedgerRepository,
  umsatzRepo: sqliteUmsatzRepository,
  erkennungRepo: sqliteVertragserkennungRepository,
  zuordnungRepo: sqliteVertragszuordnungRepository,
};
