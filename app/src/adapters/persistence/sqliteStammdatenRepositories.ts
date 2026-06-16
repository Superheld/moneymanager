// SQLite-Implementierungen der Stammdaten-Ports (Person, Zahlungskonto, Kategorie).
// inhaber_ids wird als JSON-Textspalte gehalten (n:m, bewusst einfach für P1).

import type {
  Charakter,
  Kategorie,
  Kontotyp,
  Person,
  Zahlungskonto,
} from "../../core";
import type {
  KategorieRepository,
  PersonRepository,
  ZahlungskontoRepository,
} from "../../application/ports";
import { getDb } from "./db";

export const sqlitePersonRepository: PersonRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<
      { id: string; name: string; geburtsdatum: string | null; rolle: string | null }[]
    >("SELECT id, name, geburtsdatum, rolle FROM person ORDER BY name");
    return zeilen.map((z) => ({
      id: z.id,
      name: z.name,
      geburtsdatum: z.geburtsdatum ?? undefined,
      rolle: z.rolle ?? undefined,
    }));
  },
  async speichern(p: Person) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO person (id, name, geburtsdatum, rolle) VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name,
         geburtsdatum = excluded.geburtsdatum, rolle = excluded.rolle`,
      [p.id, p.name, p.geburtsdatum ?? null, p.rolle ?? null],
    );
  },
  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM person WHERE id = $1", [id]);
  },
};

export const sqliteZahlungskontoRepository: ZahlungskontoRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<
      { id: string; bezeichnung: string; typ: string; iban: string | null; inhaber_ids: string; kontostand: number }[]
    >("SELECT id, bezeichnung, typ, iban, inhaber_ids, kontostand FROM zahlungskonto ORDER BY bezeichnung");
    return zeilen.map((z) => ({
      id: z.id,
      bezeichnung: z.bezeichnung,
      typ: z.typ as Kontotyp,
      iban: z.iban ?? undefined,
      inhaberIds: parseIds(z.inhaber_ids),
      saldo: z.kontostand ?? 0,
    }));
  },
  async speichern(k: Zahlungskonto) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO zahlungskonto (id, bezeichnung, typ, iban, inhaber_ids, kontostand) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung, typ = excluded.typ,
         iban = excluded.iban, inhaber_ids = excluded.inhaber_ids, kontostand = excluded.kontostand`,
      [k.id, k.bezeichnung, k.typ, k.iban ?? null, JSON.stringify(k.inhaberIds), k.saldo],
    );
  },
  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM zahlungskonto WHERE id = $1", [id]);
  },
};

export const sqliteKategorieRepository: KategorieRepository = {
  async alle() {
    const db = await getDb();
    const zeilen = await db.select<
      { id: string; name: string; eltern_id: string | null; default_charakter: string }[]
    >("SELECT id, name, eltern_id, default_charakter FROM kategorie ORDER BY name");
    return zeilen.map((z) => ({
      id: z.id,
      name: z.name,
      elternId: z.eltern_id ?? undefined,
      defaultCharakter: z.default_charakter as Charakter,
    }));
  },
  async speichern(k: Kategorie) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO kategorie (id, name, eltern_id, default_charakter) VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, eltern_id = excluded.eltern_id,
         default_charakter = excluded.default_charakter`,
      [k.id, k.name, k.elternId ?? null, k.defaultCharakter],
    );
  },
  async loeschen(id) {
    const db = await getDb();
    await db.execute("DELETE FROM kategorie WHERE id = $1", [id]);
  },
};

function parseIds(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
