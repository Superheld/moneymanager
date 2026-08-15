// Remapping Finanzguru-Unterkategorie → unsere Unterkategorie (Namen aus
// standardkategorien.ts). Aus dem Lern-Spike (transaction-classifier/remapping.mjs)
// portiert und gegen den optimierten Kategorie-Baum validiert.
//
// Liefert nur einen NAMEN; die Auflösung auf eine konkrete Kategorie-ID (und damit den
// Charakter) macht die Review-Schicht über den Katalog des Nutzers. Trifft kein Eintrag,
// bleibt die Buchung unkategorisiert (Review-Inbox). Umbuchungen laufen NICHT hierüber —
// die erkennt der Adapter separat (RohUmsatz.istUmbuchung) und labelt sie als Umschichtung.

export const FG_REMAPPING: Readonly<Record<string, string>> = {
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

/** Unser Kategorie-Name für einen Finanzguru-Hinweis, oder null (→ unkategorisiert). */
export function unsereKategorieFuer(fgUnterkategorie: string | undefined): string | null {
  if (!fgUnterkategorie) return null;
  return FG_REMAPPING[fgUnterkategorie.trim()] ?? null;
}
