// Finanzgurus Kategorien → unsere. Die einzige Stelle mit diesem Wissen.
//
// **Warum das hier liegt und nicht in der Anwendungsschicht.** Es hat schon einmal dort
// gelegen (`application/import/remapping.ts`) und war eine Stufe in der zentralen
// Vorschlagskette. Damit trug die Anwendungsschicht das Vokabular EINER Quelle, und ein
// zweiter Importeur — WISO, ein Bankexport — hätte seines danebengelegt. Eine Kette mit
// einer Stufe je Quelle ist keine Kette mehr, sondern eine Fallunterscheidung.
//
// Jetzt gilt: **jeder Importeur bringt seine eigene Übersetzung mit.** Der Adapter
// liefert einen Vorschlag in UNSEREM Vokabular, die Kette entscheidet nur noch über den
// Rang. Ein WISO-Importer bekommt seine eigene Tabelle neben seinen eigenen Parser, und
// keine der beiden weiss von der anderen.
//
// **Ist das nicht Domänenlogik im Adapter?** Der Kopf des Adapters verlangt „reines
// Parsen, null Domänenlogik", und das gilt weiter: eine Übersetzungstabelle ENTSCHEIDET
// nichts über eine Buchung, sie überträgt ein fremdes Vokabular in unseres. Genau das ist
// die Aufgabe eines Adapters. Entschieden wird eine Stufe höher, und dort steht kein Wort
// über Finanzguru.
//
// **Die Tabelle ist nicht erfunden.** Sie stammt aus dem Lern-Spike, wurde gegen den
// Kategorie-Baum validiert und lag bis zum 29.08.2026 im Repo. Ausgebaut wurde sie, weil
// sie den Kaltstart trug und es mit einem mitgelieferten Modell keinen mehr gibt — das
// war richtig für die Stufe, die sie damals war, und ist kein Argument gegen die
// Übersetzung als solche.
//
// **Nur Namen, keine IDs.** Die Auflösung auf eine konkrete Kategorie macht die Kette
// über den Katalog des Nutzers — der darf umbenennen und umhängen. Ein Eintrag, dessen
// Ziel es nicht gibt, greift dann einfach nicht; `finanzguruKategorien.test.ts` hält
// fest, dass es zur Vorlage passt, damit das nicht unbemerkt bleibt.

const FG_KATEGORIEN: Readonly<Record<string, string>> = {
  // Lebenshaltung
  Lebensmittel: "Lebensmittel",
  Restaurants: "Auswärts essen",
  Lieferservice: "Lieferservice",
  Drogerie: "Drogerie",
  Porto: "Haushalt",
  Tabak: "Genussmittel",
  // Sparen (Umschichtung-Block)
  Kapitalanlage: "Sparen & Anlegen",
  Sparen: "Sparen & Anlegen",
  Bausparvertrag: "Sparen & Anlegen",
  // Freizeit & Kultur
  "Sonstiger Lifestyle": "Freizeit & Hobby",
  "Sonstige Freizeitausgaben": "Freizeit & Hobby",
  Gaming: "Gaming",
  "In-App-Kaeufe": "Gaming",
  Sport: "Sport",
  Veranstaltungen: "Veranstaltungen",
  Kino: "Ausgehen",
  Urlaub: "Reisen & Urlaub",
  Mitgliedschaft: "Mitgliedschaften",
  Bildung: "Bildung",
  // Konsum & Lifestyle
  Elektrohandel: "Elektronik",
  Bekleidung: "Kleidung & Mode",
  Shopping: "Kleidung & Mode",
  Geschenke: "Geschenke",
  "Cloud-Dienste": "Abos & Streaming",
  "Serien & Filme": "Abos & Streaming",
  "Musik & Podcasts": "Abos & Streaming",
  Mobilfunk: "Internet & Telefon",
  Friseur: "Körperpflege & Wellness",
  // Sonstiges
  "Sonstige Ausgaben": "Sonstiges",
  // Einnahmen
  "Lohn / Gehalt": "Gehalt",
  "Sonstige Einnahmen": "Sonstige Einnahmen",
  Kapitalertraege: "Kapitalerträge",
  Elterngeld: "Kindergeld",
  Mieteinnahmen: "Nebeneinkünfte",
  // Mobilität
  Tanken: "Sprit & Laden",
  Auto: "Kfz (Steuer & Wartung)",
  Wartung: "Kfz (Steuer & Wartung)",
  Fahrrad: "Fahrrad",
  "Bus & Bahn": "ÖPNV & Tickets",
  "Sharing / Gemietet": "ÖPNV & Tickets",
  // Wohnen
  Strom: "Strom & Gas",
  Miete: "Miete / Rate",
  Rundfunkgebuehren: "Rundfunkbeitrag",
  Einrichtung: "Einrichtung & Geräte",
  "Bauen / Renovieren": "Instandhaltung",
  "Sonstiges Wohnen": "Nebenkosten",
  // Finanzen
  Kredit: "Kredite & Zinsen",
  Steuern: "Steuern",
  Bankgebuehren: "Bankgebühren",
  Spende: "Spenden",
  "Sonstige Finanzausgaben": "Bankgebühren",
  // Versicherungen
  Haftpflichtversicherung: "Haftpflicht",
  Hausratversicherung: "Hausrat",
  "Sonstige Sachversicherung": "Weitere Versicherungen",
  "Private Krankenversicherung": "Krankenversicherung",
  Zahnzusatzversicherung: "Krankenzusatz",
  "KFZ-Versicherung": "KFZ-Versicherung",
  // Familie & Kinder
  "Sonstige Kinderausgaben": "Kinderbetreuung",
  Unterhalt: "Kinderbetreuung",
  // Gesundheit
  "Aerztliche Behandlung": "Arzt & Apotheke",
  Apotheke: "Arzt & Apotheke",
  "Sonstige Gesundheitsausgaben": "Therapie",
};

/**
 * Unser Kategoriename für eine Finanzguru-Unterkategorie, oder `undefined`.
 *
 * Kein Treffer heisst NICHT „unkategorisiert" — es heisst nur, dass diese Stufe nichts
 * beiträgt. Danach kommen Vertrag und Modell, und am Ende die Review-Inbox.
 */
export function unsereKategorieFuer(fgUnterkategorie: string | undefined): string | undefined {
  if (!fgUnterkategorie) return undefined;
  return FG_KATEGORIEN[fgUnterkategorie.trim()];
}

/** Alle Ziele der Tabelle — für den Wächter, der sie gegen die Vorlage hält. */
export function fgZielkategorien(): string[] {
  return [...new Set(Object.values(FG_KATEGORIEN))];
}
