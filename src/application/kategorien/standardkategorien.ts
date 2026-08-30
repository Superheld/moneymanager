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

/**
 * Ein Eintrag im Baum. Ein blosser String ist die Kurzform für „Name, Charakter vom
 * Elternteil, keine Kinder" — der Regelfall, und deshalb die Kurzform.
 *
 * **Kinder dürfen selbst Kinder haben.** Bis 2026-08-30 war die Liste auf zwei Ebenen
 * festgelegt, und das war eine Beschränkung der VORLAGE, nicht der Domäne: eine Kategorie
 * trägt seit jeher eine `elternId` und damit beliebige Tiefe. Aufgefallen ist es, als ein
 * aufgeräumter Bestand eine dritte Ebene mitbrachte und die Vorlage sie nicht abbilden
 * konnte.
 */
interface Kind {
  name: string;
  charakter?: Charakter; // überschreibt den Charakter des Elternteils
  kinder?: (string | Kind)[];
}
interface Gruppe {
  name: string;
  charakter: Charakter;
  kinder: (string | Kind)[];
}

export const STANDARDKATEGORIEN: Gruppe[] = [
  { name: "Einnahmen", charakter: "Ertrag", kinder: ["Gehalt", "Kapitalerträge", "Kindergeld", "Nebeneinkünfte", "Sonstige Einnahmen"] },
  { name: "Familie & Kinder", charakter: "Aufwand", kinder: ["Haustier", "Kinderbetreuung", "Schule & Lernen", "Taschengeld", "Unterhalt"] },
  { name: "Finanzen", charakter: "Aufwand", kinder: ["Bankgebühren", "Kredite & Zinsen", { name: "Sparen & Anlegen", charakter: "Umschichtung" }, "Spenden", "Steuern"] },
  { name: "Freizeit & Kultur", charakter: "Aufwand", kinder: ["Ausgehen", "Bildung", "Freizeit & Hobby", "Gaming", "Mitgliedschaften", "Reisen & Urlaub", "Sport", "Veranstaltungen"] },
  { name: "Gesundheit", charakter: "Aufwand", kinder: ["Arzt & Apotheke", "Krankenversicherung", "Therapie"] },
  { name: "Konsum & Lifestyle", charakter: "Aufwand", kinder: ["Abos & Streaming", "Elektronik", "Geschenke", "Kleidung & Mode", "Körperpflege & Wellness"] },
  { name: "Lebenshaltung", charakter: "Aufwand", kinder: ["Auswärts essen", "Drogerie", "Genussmittel", "Haushalt", "Lebensmittel", "Lieferservice"] },
  { name: "Mobilität", charakter: "Aufwand", kinder: ["Fahrrad", "Kfz (Steuer & Wartung)", "KFZ-Wartung", "ÖPNV & Tickets", "Sprit & Laden"] },
  { name: "Sonstiges", charakter: "Aufwand", kinder: [] },
  { name: "Versicherungen", charakter: "Aufwand", kinder: ["Berufsunfähigkeit", "Haftpflicht", "Hausrat", "KFZ-Versicherung", "Krankenzusatz", "Rechtsschutz", "Weitere Versicherungen"] },
  { name: "Vorsorge", charakter: "Umschichtung", kinder: ["Altersvorsorge", "Private Rente"] },
  { name: "Wohnen", charakter: "Aufwand", kinder: [{ name: "Einrichtung & Geräte", kinder: ["Anschaffungen"] }, "Energie", "Instandhaltung", "Internet & Telefon", "Miete", "Miete / Rate", "Nebenkosten", "Rundfunkbeitrag", "Strom & Gas"] },
];

/**
 * Der Baum flach, mit IDs, die aus den NAMEN folgen statt gewürfelt zu sein.
 *
 * **Gebraucht wird das vom Spielstand** (`npm run seed`), und der Grund ist der Fehler,
 * den es beheben soll: der Seed führte bis 2026-08-30 eine eigene Kategorienliste mit
 * eigenen Namen — `Mobilitaet` ohne Umlaut, `Miete` statt `Miete / Rate`, `Energie` statt
 * `Strom & Gas`. `standardkategorienAnlegen` gleicht über den NAMEN ab; sieben der
 * vierzehn fanden deshalb keinen Partner, und wer nach dem Seed „Standardkategorien
 * laden" drückte, bekam sie doppelt. Zwei Listen für dieselbe Sache driften, und diese
 * hier haben es getan.
 *
 * **Warum sprechende IDs und keine UUIDs:** der Spielstand muss reproduzierbar sein —
 * derselbe Aufruf, derselbe Bestand, damit ein Screenshot von gestern dieselben Zahlen
 * zeigt wie einer von heute. `crypto.randomUUID()` bricht das. Und sie sind lesbar:
 * `kat-lebensmittel` in einer Fixture sagt, worum es geht, eine UUID nicht.
 *
 * **In der App bleibt es bei UUIDs.** Dort ist eine Kategorie ein Datensatz, den jemand
 * umbenennen darf — eine ID, die den Namen trägt, wäre beim ersten Umbenennen eine Lüge.
 */
export function standardkategorienFlach(): Kategorie[] {
  const ergebnis: Kategorie[] = [];

  const zweig = (eintraege: readonly (string | Kind)[], elternId: string | undefined, erbe: Charakter) => {
    for (const eintrag of eintraege) {
      const name = typeof eintrag === "string" ? eintrag : eintrag.name;
      const charakter = typeof eintrag === "string" ? erbe : eintrag.charakter ?? erbe;
      const id = kategorieSlug(name);
      ergebnis.push({ id, name, elternId, defaultCharakter: charakter });
      if (typeof eintrag !== "string" && eintrag.kinder) zweig(eintrag.kinder, id, charakter);
    }
  };

  for (const g of STANDARDKATEGORIEN) {
    const id = kategorieSlug(g.name);
    ergebnis.push({ id, name: g.name, defaultCharakter: g.charakter });
    zweig(g.kinder, id, g.charakter);
  }
  return ergebnis;
}

/**
 * Aus einem Namen eine ID: `Kfz (Steuer & Wartung)` → `kat-kfz-steuer-wartung`.
 *
 * Umlaute werden AUSGESCHRIEBEN und nicht weggeworfen — sonst würden `Mobilität` und
 * `Mobilitt` dasselbe, und aus zwei Kategorien mit ähnlichem Namen könnte eine werden.
 * Dass keine zwei Namen denselben Slug ergeben, prüft `standardkategorien.test.ts`; das
 * ist keine Formalität, sondern die Bedingung dafür, dass die IDs überhaupt taugen.
 */
export function kategorieSlug(name: string): string {
  const roh = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `kat-${roh}`;
}

/**
 * Legt die Standardkategorien an. Idempotent: bereits vorhandene Namen werden
 * übersprungen. Liefert die Anzahl neu angelegter Kategorien.
 */
export async function standardkategorienAnlegen(repo: KategorieRepository): Promise<number> {
  // **Einmal laden, dann die Karte fortschreiben.** Vorher stand mitten in der Schleife
  // ein zweites `repo.alle()`, um die ID einer bereits vorhandenen Gruppe zu finden — bei
  // zwölf Gruppen also bis zu zwölf zusätzliche Vollabfragen. Die Karte hier weiss
  // dasselbe, weil sie um jeden neu angelegten Eintrag mitwächst.
  const nachName = new Map<string, string>();
  for (const k of await repo.alle()) nachName.set(k.name.toLowerCase(), k.id);
  let angelegt = 0;

  /** Legt an, falls der Name noch fehlt, und meldet die ID — die neue oder die alte. */
  const sichern = async (k: Kategorie): Promise<string> => {
    const schluessel = k.name.toLowerCase();
    const bekannt = nachName.get(schluessel);
    if (bekannt) return bekannt;
    await repo.speichern(k);
    nachName.set(schluessel, k.id);
    angelegt++;
    return k.id;
  };

  async function zweig(eintraege: readonly (string | Kind)[], elternId: string, erbe: Charakter) {
    for (const eintrag of eintraege) {
      const name = typeof eintrag === "string" ? eintrag : eintrag.name;
      const charakter = typeof eintrag === "string" ? erbe : eintrag.charakter ?? erbe;
      const id = await sichern({ id: crypto.randomUUID(), name, elternId, defaultCharakter: charakter });
      if (typeof eintrag !== "string" && eintrag.kinder) await zweig(eintrag.kinder, id, charakter);
    }
  }

  for (const g of STANDARDKATEGORIEN) {
    const id = await sichern({ id: crypto.randomUUID(), name: g.name, defaultCharakter: g.charakter });
    await zweig(g.kinder, id, g.charakter);
  }
  return angelegt;
}
