// SQLite-Implementierungen der Stammdaten-Ports (Person, Zahlungskonto, Kategorie).
// inhaber_ids wird als JSON-Textspalte gehalten (n:m, bewusst einfach für P1).

import { klasseVorschlag } from "../../core";
import type {
  Charakter,
  Kategorie,
  Kontoklasse,
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
      {
        id: string;
        bezeichnung: string;
        typ: string;
        klasse: string | null;
        iban: string | null;
        inhaber_ids: string;
        kontostand: number;
        aktiv: number;
      }[]
    >(
      `SELECT id, bezeichnung, typ, klasse, iban, inhaber_ids, kontostand, aktiv
         FROM zahlungskonto ORDER BY bezeichnung`,
    );
    return zeilen.map((z) => {
      const typ = z.typ as Kontotyp;
      return {
        id: z.id,
        bezeichnung: z.bezeichnung,
        typ,
        // Fällt auf den Vorschlag zurück, statt `undefined` durchzulassen: die Klasse
        // entscheidet, ob ein Saldo mitzählt, und ein Konto ohne sie fiele stillschweigend
        // aus den liquiden Mitteln. Migration 40 belegt zwar alles vor — aber eine Zeile,
        // die auf anderem Weg hereinkommt, soll nicht am Fehlen eines Feldes verschwinden.
        klasse: (z.klasse as Kontoklasse | null) ?? klasseVorschlag(typ),
        iban: z.iban ?? undefined,
        inhaberIds: parseIds(z.inhaber_ids),
        saldo: z.kontostand ?? 0,
        // Ausdrücklich gesetzt und nicht bei `undefined` gelassen: nach oben soll niemand
        // wissen müssen, dass ein fehlender Wert JA heisst. Die Kulanz im Typ ist für
        // Aufrufer, die ein Konto BAUEN — nicht für den, der eines liest.
        aktiv: z.aktiv !== 0,
      };
    });
  },
  async speichern(k: Zahlungskonto) {
    const db = await getDb();
    await db.execute(
      // **`aktiv` steht bewusst NICHT in dieser Liste.** `kontoAnlegen` wird auch zum
      // BEARBEITEN benutzt (mit `id`, über das ON CONFLICT), und es baut ein Konto ohne
      // dieses Feld — jedes Speichern eines stillgelegten Kontos machte es damit
      // stillschweigend wieder aktiv. Die Stilllegung hat ihren eigenen Schreibweg
      // (`aktivSetzen`), und ein neues Konto bekommt die 1 aus der Spaltenvorgabe.
      // Dieselbe Trennung wie bei Beleg und Verarbeitungsstand: was verschiedene
      // Lebenszyklen hat, wird nicht von derselben Anweisung geschrieben.
      `INSERT INTO zahlungskonto (id, bezeichnung, typ, klasse, iban, inhaber_ids, kontostand)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET bezeichnung = excluded.bezeichnung, typ = excluded.typ,
         klasse = excluded.klasse, iban = excluded.iban, inhaber_ids = excluded.inhaber_ids,
         kontostand = excluded.kontostand`,
      [
        k.id,
        k.bezeichnung,
        k.typ,
        k.klasse ?? klasseVorschlag(k.typ),
        k.iban ?? null,
        JSON.stringify(k.inhaberIds),
        k.saldo,
      ],
    );
  },
  async aktivSetzen(id, aktiv) {
    const db = await getDb();
    await db.execute("UPDATE zahlungskonto SET aktiv = $1 WHERE id = $2", [aktiv ? 1 : 0, id]);
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
