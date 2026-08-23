// SQLite-Implementierung des Ledger-Ports (ADR-0002) — das app-seitige Ist-Journal.
// planRef wird auf zwei Spalten abgebildet (plan_quelle_id, plan_faelligkeit); ein
// UNIQUE-Index darauf erzwingt 1:1-Matching. Später dockt hier der Bankimport an.

import type { Aufteilung, Charakter, IstBuchung, IstQuelle, Kategorieherkunft } from "../../core";
import type { LedgerPort } from "../../application/ports";
import { getDb } from "./db";
import { inTransaktion, type Anweisung } from "./transaktion";

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
  roh_hash: string | null;
  zu_pruefen: number | null;
}


// ── Das Journal: was mit einer Buchung geschah ────────────────────────────────────────
//
// Der BELEG ist seit v44 geschützt — `umsatz_roh` wird nach dem Anlegen nicht mehr
// beschrieben. Die BUCHUNG war es nie: jede Änderung überschrieb still, jedes Löschen
// löschte wirklich, und was vorher dastand, war danach nicht mehr feststellbar. Auch
// nicht für den, der es selbst geändert hat.
//
// Protokolliert wird der GANZE Zustand, nicht der Unterschied. Ein Eintrag soll für sich
// lesbar sein; wer eine Kette von Diffs zurückrechnen muss, um den Stand von damals zu
// sehen, hat kein Protokoll, sondern eine Aufgabe.

/** Der Zustand einer Buchung samt Aufteilungen — so, wie er in der Datenbank steht. */
type Stand = Record<string, unknown>;

async function standLesen(
  db: Awaited<ReturnType<typeof getDb>>,
  id: string,
): Promise<Stand | null> {
  const zeilen = await db.select<Stand[]>("SELECT * FROM ist_buchung WHERE id = $1", [id]);
  if (zeilen.length === 0) return null;
  const teile = await db.select<Stand[]>(
    "SELECT kategorie_id, betrag, notiz FROM ist_buchung_aufteilung WHERE istbuchung_id = $1 ORDER BY kategorie_id",
    [id],
  );
  return { ...zeilen[0], aufteilungen: teile };
}

/**
 * Der Zustand, wie er nach dem Schreiben dastehen wird.
 *
 * `vertrag_id` und `vertrag_herkunft` kommen aus dem ALTEN Stand: das Ledger-Repository
 * schreibt sie nicht (das tut die Vertragszuordnung), und sie bleiben beim `ON CONFLICT`
 * unberührt. Sie hier wegzulassen liesse das Protokoll behaupten, sie seien entfernt
 * worden.
 */
function standAus(b: IstBuchung, vorher: Stand | null): Stand {
  return {
    id: b.id,
    datum: b.datum,
    betrag: b.betrag,
    konto_id: b.kontoId,
    kategorie_id: b.kategorieId ?? null,
    kategorie_herkunft: b.kategorieHerkunft ?? "automatisch",
    charakter: b.charakter,
    quelle: b.quelle,
    notiz: b.notiz ?? null,
    transfer_id: b.transferId ?? null,
    gegenkonto_id: b.gegenkontoId ?? null,
    plan_quelle_id: b.planRef?.quelleId ?? null,
    plan_faelligkeit: b.planRef?.faelligkeit ?? null,
    roh_hash: b.rohHash ?? null,
    zu_pruefen: b.zuPruefen ? 1 : 0,
    vertrag_id: vorher?.vertrag_id ?? null,
    vertrag_herkunft: vorher?.vertrag_herkunft ?? null,
    aufteilungen: (b.aufteilungen ?? []).map((a) => ({
      kategorie_id: a.kategorieId,
      betrag: a.betrag,
      notiz: a.notiz ?? null,
    })),
  };
}

/**
 * JSON mit SORTIERTEN Schlüsseln.
 *
 * Ohne das Sortieren stünde jeder Eintrag in der Reihenfolge, in der er zufällig gebaut
 * wurde — `SELECT *` liefert Tabellenreihenfolge, ein Objektliteral seine eigene —, und
 * der Vergleich „hat sich etwas geändert" schlüge bei jedem Speichern an, obwohl sich
 * nichts geändert hat. Gemessen: genau das passierte.
 */
function alsText(stand: Stand): string {
  return JSON.stringify(stand, Object.keys(stand).sort());
}

/**
 * Ein Journaleintrag — oder keiner.
 *
 * Bleibt leer, wenn sich nichts geändert hat. Ein Speichern ohne Änderung ist keine
 * Tatsache über das Geld, und ein Protokoll, das jeden Klick festhält, wird zu Rauschen,
 * in dem die echten Änderungen untergehen.
 */
function journalAnweisung(id: string, vorher: Stand | null, nachher: Stand | null): Anweisung[] {
  const a = vorher ? alsText(vorher) : null;
  const b = nachher ? alsText(nachher) : null;
  if (a === b) return [];

  const art = vorher === null ? "angelegt" : nachher === null ? "geloescht" : "geaendert";
  return [
    {
      sql: `INSERT INTO buchung_journal (id, istbuchung_id, zeitpunkt, art, vorher, nachher)
            VALUES ($1, $2, $3, $4, $5, $6)`,
      werte: [crypto.randomUUID(), id, new Date().toISOString(), art, a, b],
    },
  ];
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
                roh_hash, zu_pruefen
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
        rohHash: z.roh_hash ?? undefined,
        // Nur setzen, wenn er WIRKLICH steht: `zuPruefen: false` überall wäre dasselbe
        // wie undefined, macht aber jeden Objektvergleich in Tests und jeden Diff
        // unnötig laut.
        zuPruefen: z.zu_pruefen ? true : undefined,
      }),
    );
  },
  async speichern(b: IstBuchung) {
    const db = await getDb();
    const vorher = await standLesen(db, b.id);
    const nachher = standAus(b, vorher);

    await inTransaktion(db, [
      ...journalAnweisung(b.id, vorher, nachher),
      {
        sql: `INSERT INTO ist_buchung
         (id, datum, betrag, konto_id, kategorie_id, kategorie_herkunft, charakter, quelle, notiz, transfer_id, gegenkonto_id, plan_quelle_id, plan_faelligkeit, roh_hash, zu_pruefen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT(id) DO UPDATE SET datum = excluded.datum, betrag = excluded.betrag,
         konto_id = excluded.konto_id, kategorie_id = excluded.kategorie_id,
         kategorie_herkunft = excluded.kategorie_herkunft,
         charakter = excluded.charakter, quelle = excluded.quelle, notiz = excluded.notiz,
         transfer_id = excluded.transfer_id, gegenkonto_id = excluded.gegenkonto_id,
         plan_quelle_id = excluded.plan_quelle_id, plan_faelligkeit = excluded.plan_faelligkeit,
         roh_hash = excluded.roh_hash, zu_pruefen = excluded.zu_pruefen`,
        werte: [
          b.id, b.datum, b.betrag, b.kontoId, b.kategorieId ?? null,
          // Die Spalte ist NOT NULL: ein fehlendes Feld heißt „automatisch" (siehe
          // core/istbuchung#Kategorieherkunft) und wird hier explizit dazu gemacht.
          b.kategorieHerkunft ?? "automatisch",
          b.charakter, b.quelle, b.notiz ?? null, b.transferId ?? null, b.gegenkontoId ?? null,
          b.planRef?.quelleId ?? null, b.planRef?.faelligkeit ?? null, b.rohHash ?? null,
          b.zuPruefen ? 1 : 0,
        ],
      },
      // Aufteilungen: ersetzen statt abgleichen. Sie sind Value Objects ohne eigene
      // Identität — welche Zeile „dieselbe" ist, ist keine sinnvolle Frage, und ein
      // Abgleich würde nur Ordnung und Ids ohne Nutzen bewahren.
      //
      // Das Löschen und das Neuanlegen stehen jetzt in derselben Klammer wie die Buchung.
      // Vorher waren es einzelne Statements: brach es dazwischen ab, stand die Buchung
      // ohne ihre Teile da, und Σ Teile ≠ Betrag — eine Invariante, die der Kern
      // voraussetzt und die niemand nachträglich reparieren kann.
      { sql: "DELETE FROM ist_buchung_aufteilung WHERE istbuchung_id = $1", werte: [b.id] },
      ...(b.aufteilungen ?? []).map((a): Anweisung => ({
        sql: `INSERT INTO ist_buchung_aufteilung (id, istbuchung_id, kategorie_id, betrag, notiz)
         VALUES ($1, $2, $3, $4, $5)`,
        werte: [crypto.randomUUID(), b.id, a.kategorieId, a.betrag, a.notiz ?? null],
      })),
    ]);
  },
  async loeschen(id: string) {
    const db = await getDb();
    const vorher = await standLesen(db, id);

    await inTransaktion(db, [
      ...journalAnweisung(id, vorher, null),
      { sql: "DELETE FROM ist_buchung_aufteilung WHERE istbuchung_id = $1", werte: [id] },
      { sql: "DELETE FROM ist_buchung WHERE id = $1", werte: [id] },
    ]);
  },
};
