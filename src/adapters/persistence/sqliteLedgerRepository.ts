// SQLite-Implementierung des Ledger-Ports (ADR-0002) — das app-seitige Ist-Journal.
// planRef wird auf zwei Spalten abgebildet (plan_quelle_id, plan_faelligkeit); ein
// UNIQUE-Index darauf erzwingt 1:1-Matching. Später dockt hier der Bankimport an.

import type { Aufteilung, Charakter, IstBuchung, IstQuelle, Kategorieherkunft } from "../../core";
import type { LedgerPort } from "../../application/ports";
import { getDb } from "./db";

interface AufteilungZeile {
  id: string;
  istbuchung_id: string;
  kategorie_id: string;
  betrag: number;
  notiz: string | null;
}

interface Zeile {
  id: string;
  datum: string;
  betrag: number;
  konto_id: string;
  kategorie_id: string | null;
  kategorie_herkunft: string | null;
  charakter: string;
  quelle: string;
  notiz: string | null;
  transfer_id: string | null;
  gegenkonto_id: string | null;
  plan_quelle_id: string | null;
  plan_faelligkeit: string | null;
  verwendung_topf_id: string | null;
  roh_hash: string | null;
}

export const sqliteLedgerRepository: LedgerPort = {
  async alle() {
    const db = await getDb();
    // Aufteilungen in EINER Abfrage mitziehen statt je Buchung nachzuladen — bei 5000+
    // Buchungen wäre das sonst ein N+1 über die gesamte Ledger-Ladung.
    const [zeilen, teile] = await Promise.all([
      db.select<Zeile[]>(
        `SELECT id, datum, betrag, konto_id, kategorie_id, kategorie_herkunft, charakter,
                quelle, notiz, transfer_id, gegenkonto_id, plan_quelle_id, plan_faelligkeit,
                verwendung_topf_id, roh_hash
           FROM ist_buchung ORDER BY datum`,
      ),
      db.select<AufteilungZeile[]>(
        `SELECT id, istbuchung_id, kategorie_id, betrag, notiz
           FROM ist_buchung_aufteilung ORDER BY rowid`,
      ),
    ]);

    const teileJeBuchung = new Map<string, Aufteilung[]>();
    for (const t of teile) {
      const liste = teileJeBuchung.get(t.istbuchung_id) ?? [];
      liste.push({ kategorieId: t.kategorie_id, betrag: t.betrag, notiz: t.notiz ?? undefined });
      teileJeBuchung.set(t.istbuchung_id, liste);
    }

    return zeilen.map(
      (z): IstBuchung => ({
        aufteilungen: teileJeBuchung.get(z.id),
        id: z.id,
        datum: z.datum,
        betrag: z.betrag,
        kontoId: z.konto_id,
        kategorieId: z.kategorie_id ?? undefined,
        kategorieHerkunft: (z.kategorie_herkunft as Kategorieherkunft | null) ?? undefined,
        charakter: z.charakter as Charakter,
        quelle: z.quelle as IstQuelle,
        notiz: z.notiz ?? undefined,
        transferId: z.transfer_id ?? undefined,
        gegenkontoId: z.gegenkonto_id ?? undefined,
        planRef:
          z.plan_quelle_id && z.plan_faelligkeit
            ? { quelleId: z.plan_quelle_id, faelligkeit: z.plan_faelligkeit }
            : undefined,
        verwendung: z.verwendung_topf_id
          ? { art: "topf", topfId: z.verwendung_topf_id }
          : undefined,
        rohHash: z.roh_hash ?? undefined,
      }),
    );
  },
  async speichern(b: IstBuchung) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO ist_buchung
         (id, datum, betrag, konto_id, kategorie_id, kategorie_herkunft, charakter, quelle, notiz, transfer_id, gegenkonto_id, plan_quelle_id, plan_faelligkeit, verwendung_topf_id, roh_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT(id) DO UPDATE SET datum = excluded.datum, betrag = excluded.betrag,
         konto_id = excluded.konto_id, kategorie_id = excluded.kategorie_id,
         kategorie_herkunft = excluded.kategorie_herkunft,
         charakter = excluded.charakter, quelle = excluded.quelle, notiz = excluded.notiz,
         transfer_id = excluded.transfer_id, gegenkonto_id = excluded.gegenkonto_id,
         plan_quelle_id = excluded.plan_quelle_id, plan_faelligkeit = excluded.plan_faelligkeit,
         verwendung_topf_id = excluded.verwendung_topf_id, roh_hash = excluded.roh_hash`,
      [
        b.id,
        b.datum,
        b.betrag,
        b.kontoId,
        b.kategorieId ?? null,
        // Die Spalte ist NOT NULL: ein fehlendes Feld heißt „automatisch" (siehe
        // core/istbuchung#Kategorieherkunft) und wird hier explizit dazu gemacht.
        b.kategorieHerkunft ?? "automatisch",
        b.charakter,
        b.quelle,
        b.notiz ?? null,
        b.transferId ?? null,
        b.gegenkontoId ?? null,
        b.planRef?.quelleId ?? null,
        b.planRef?.faelligkeit ?? null,
        b.verwendung?.art === "topf" ? b.verwendung.topfId : null,
        b.rohHash ?? null,
      ],
    );

    // Aufteilungen: ersetzen statt abgleichen. Sie sind Value Objects ohne eigene
    // Identität — welche Zeile „dieselbe" ist, ist keine sinnvolle Frage, und ein
    // Abgleich würde nur Ordnung und Ids ohne Nutzen bewahren.
    await db.execute("DELETE FROM ist_buchung_aufteilung WHERE istbuchung_id = $1", [b.id]);
    for (const a of b.aufteilungen ?? []) {
      await db.execute(
        `INSERT INTO ist_buchung_aufteilung (id, istbuchung_id, kategorie_id, betrag, notiz)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), b.id, a.kategorieId, a.betrag, a.notiz ?? null],
      );
    }
  },
  async loeschen(id: string) {
    const db = await getDb();
    await db.execute("DELETE FROM ist_buchung_aufteilung WHERE istbuchung_id = $1", [id]);
    await db.execute("DELETE FROM ist_buchung WHERE id = $1", [id]);
  },
};
