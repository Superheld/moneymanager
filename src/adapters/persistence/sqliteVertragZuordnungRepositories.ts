// SQLite-Implementierungen der beiden Zuordnungs-Ports (Migration 19):
// die Erkennungsregel je Vertrag und die Zuordnung je Ist-Buchung.
//
// Die Schlüsselliste liegt als JSON-Textspalte — dasselbe Muster wie `inhaber_ids` beim
// Zahlungskonto. Eine eigene Zeilen-Tabelle wäre sauberer normalisiert und hier reine
// Zeremonie: die Liste hat zwei bis drei Einträge, wird immer vollständig gelesen und
// vollständig geschrieben.

import type { Vertragserkennung, Vertragszuordnung, Zuordnungsherkunft } from "../../core";
import type {
  VertragserkennungRepository,
  VertragszuordnungRepository,
} from "../../application/ports";
import type { AbgleichDeps } from "../../application/vertragszuordnung";
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

/** Defensiv: ein kaputter JSON-Eintrag darf die Vertragsliste nicht ausfallen lassen. */
function parseSchluessel(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
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
      schluessel: parseSchluessel(z.schluessel),
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
        JSON.stringify(e.schluessel),
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
