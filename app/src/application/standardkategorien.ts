// Standardkategorien — ein sinnvoller deutscher Default-Baum, angelehnt an gängige
// Haushaltsbuch-Apps (Wohnen, Mobilität, Lebenshaltung, Gesundheit, Versicherungen,
// Freizeit, Einnahmen, Sparen & Anlegen). Jede trägt einen Default-Charakter:
// Einnahmen = Ertrag, Sparen/Anlegen = Umschichtung, sonst Aufwand.

import type { Charakter, Kategorie } from "../core";
import type { KategorieRepository } from "./ports";

interface Gruppe {
  name: string;
  charakter: Charakter;
  kinder: string[];
}

export const STANDARDKATEGORIEN: Gruppe[] = [
  { name: "Einnahmen", charakter: "Ertrag", kinder: ["Gehalt", "Kindergeld", "Sonstige Einnahmen"] },
  { name: "Wohnen", charakter: "Aufwand", kinder: ["Miete / Rate", "Nebenkosten", "Strom", "Internet & Telefon", "Rundfunkbeitrag"] },
  { name: "Lebenshaltung", charakter: "Aufwand", kinder: ["Lebensmittel", "Drogerie & Haushalt", "Auswärts essen"] },
  { name: "Mobilität", charakter: "Aufwand", kinder: ["ÖPNV & Tickets", "Sprit", "Kfz (Steuer & Wartung)"] },
  { name: "Gesundheit", charakter: "Aufwand", kinder: ["Arzt & Apotheke", "Krankenversicherung"] },
  { name: "Versicherungen", charakter: "Aufwand", kinder: ["Haftpflicht", "Hausrat", "Weitere Versicherungen"] },
  { name: "Freizeit", charakter: "Aufwand", kinder: ["Hobby", "Reisen", "Abos & Streaming"] },
  { name: "Kleidung", charakter: "Aufwand", kinder: [] },
  { name: "Bildung", charakter: "Aufwand", kinder: [] },
  { name: "Kinder", charakter: "Aufwand", kinder: [] },
  { name: "Sparen & Anlegen", charakter: "Umschichtung", kinder: ["Sparplan / ETF", "Rücklagen", "Altersvorsorge"] },
  { name: "Sonstiges", charakter: "Aufwand", kinder: [] },
];

/**
 * Legt die Standardkategorien an. Idempotent: bereits vorhandene Namen werden
 * übersprungen, sodass der Aufruf gefahrlos wiederholbar ist. Liefert die Anzahl
 * neu angelegter Kategorien.
 */
export async function standardkategorienAnlegen(repo: KategorieRepository): Promise<number> {
  const vorhanden = new Set((await repo.alle()).map((k) => k.name.toLowerCase()));
  let angelegt = 0;

  for (const g of STANDARDKATEGORIEN) {
    let elternId: string | undefined;
    if (!vorhanden.has(g.name.toLowerCase())) {
      const eltern: Kategorie = { id: crypto.randomUUID(), name: g.name, defaultCharakter: g.charakter };
      await repo.speichern(eltern);
      vorhanden.add(g.name.toLowerCase());
      angelegt++;
      elternId = eltern.id;
    } else {
      elternId = (await repo.alle()).find((k) => k.name.toLowerCase() === g.name.toLowerCase())?.id;
    }

    for (const kindName of g.kinder) {
      if (vorhanden.has(kindName.toLowerCase())) continue;
      const kind: Kategorie = { id: crypto.randomUUID(), name: kindName, elternId, defaultCharakter: g.charakter };
      await repo.speichern(kind);
      vorhanden.add(kindName.toLowerCase());
      angelegt++;
    }
  }
  return angelegt;
}
