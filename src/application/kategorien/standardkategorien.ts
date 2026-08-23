// Standardkategorien — deutscher Default-Baum: Hauptgruppen → Unterkategorien.
// Jede Gruppe hat einen Default-Charakter; einzelne Kinder können ihn überschreiben
// (z. B. „Sparen & Anlegen" = Umschichtung in der ansonsten Aufwand-Gruppe Finanzen).
// Einnahmen = Ertrag, Vorsorge/Sparen = Umschichtung, sonst Aufwand.
//
// KEINE Kategorie für Erstattungen, und das ist Absicht. Ein Rückfluss gehört in die
// Kategorie der AUSGABE: eine Erstattung für Kleidung entlastet das Kleidungsbudget.
// Unter „Einnahmen" gebucht täte sie das nie — sie blähte stattdessen die Einnahmen auf,
// und derselbe Vorgang stünde je nach Einsortierung für zwei völlig verschiedene
// Aussagen. Es braucht dafür auch nichts: der Charakter sagt WOFÜR das Geld war, das
// Vorzeichen sagt, wohin es floss, und eine Erstattung ist damit ein Aufwand mit
// positivem Betrag (CLAUDE.md → „Die Richtung kommt vom Beleg").
//
// Das gilt auch, wenn die ursprüngliche Ausgabe gar nicht im Bestand steht: eine
// Steuerrückerstattung gehört zu „Steuern", eine Kautionsrückzahlung zu „Wohnen".
// Migration v60 räumt die alte Kategorie weg, sofern sie leer geblieben ist.

import type { Charakter, Kategorie } from "../../core";
import type { KategorieRepository } from "../ports";

interface Kind {
  name: string;
  charakter?: Charakter; // überschreibt den Gruppen-Charakter
}
interface Gruppe {
  name: string;
  charakter: Charakter;
  kinder: (string | Kind)[];
}

export const STANDARDKATEGORIEN: Gruppe[] = [
  { name: "Einnahmen", charakter: "Ertrag", kinder: ["Gehalt", "Nebeneinkünfte", "Kapitalerträge", "Kindergeld", "Sonstige Einnahmen"] },
  { name: "Wohnen", charakter: "Aufwand", kinder: ["Miete / Rate", "Nebenkosten", "Strom & Gas", "Internet & Telefon", "Rundfunkbeitrag", "Instandhaltung", "Einrichtung & Geräte"] },
  { name: "Lebenshaltung", charakter: "Aufwand", kinder: ["Lebensmittel", "Auswärts essen", "Lieferservice", "Drogerie", "Haushalt", "Genussmittel"] },
  { name: "Mobilität", charakter: "Aufwand", kinder: ["ÖPNV & Tickets", "Sprit & Laden", "Kfz (Steuer & Wartung)", "Fahrrad"] },
  { name: "Gesundheit", charakter: "Aufwand", kinder: ["Arzt & Apotheke", "Krankenversicherung", "Therapie"] },
  // Lifestyle aufgeteilt (Erlebnisse vs. Konsum) — sonst zu groß; FG-Feinheiten übernommen.
  { name: "Freizeit & Kultur", charakter: "Aufwand", kinder: ["Freizeit & Hobby", "Sport", "Gaming", "Veranstaltungen", "Ausgehen", "Reisen & Urlaub", "Mitgliedschaften", "Bildung"] },
  { name: "Konsum & Lifestyle", charakter: "Aufwand", kinder: ["Elektronik", "Kleidung & Mode", "Geschenke", "Abos & Streaming", "Körperpflege & Wellness"] },
  { name: "Familie & Kinder", charakter: "Aufwand", kinder: ["Kinderbetreuung", "Schule & Lernen", "Taschengeld", "Haustier"] },
  { name: "Versicherungen", charakter: "Aufwand", kinder: ["Haftpflicht", "Hausrat", "KFZ-Versicherung", "Krankenzusatz", "Rechtsschutz", "Berufsunfähigkeit", "Weitere Versicherungen"] },
  { name: "Vorsorge", charakter: "Umschichtung", kinder: ["Altersvorsorge", "Private Rente"] },
  {
    name: "Finanzen",
    charakter: "Aufwand",
    kinder: [{ name: "Sparen & Anlegen", charakter: "Umschichtung" }, "Kredite & Zinsen", "Bankgebühren", "Steuern", "Spenden"],
  },
  { name: "Sonstiges", charakter: "Aufwand", kinder: [] },
];

/**
 * Legt die Standardkategorien an. Idempotent: bereits vorhandene Namen werden
 * übersprungen. Liefert die Anzahl neu angelegter Kategorien.
 */
export async function standardkategorienAnlegen(repo: KategorieRepository): Promise<number> {
  const vorhanden = new Set((await repo.alle()).map((k) => k.name.toLowerCase()));
  let angelegt = 0;

  const sichern = async (k: Kategorie) => {
    if (vorhanden.has(k.name.toLowerCase())) return false;
    await repo.speichern(k);
    vorhanden.add(k.name.toLowerCase());
    angelegt++;
    return true;
  };

  for (const g of STANDARDKATEGORIEN) {
    const elternId = crypto.randomUUID();
    const neu = await sichern({ id: elternId, name: g.name, defaultCharakter: g.charakter });
    // Eltern-ID für Kinder bestimmen (auch wenn die Gruppe schon existierte).
    const elter = neu ? elternId : (await repo.alle()).find((k) => k.name.toLowerCase() === g.name.toLowerCase())?.id;

    for (const kind of g.kinder) {
      const name = typeof kind === "string" ? kind : kind.name;
      const charakter = typeof kind === "string" ? g.charakter : kind.charakter ?? g.charakter;
      await sichern({ id: crypto.randomUUID(), name, elternId: elter, defaultCharakter: charakter });
    }
  }
  return angelegt;
}
