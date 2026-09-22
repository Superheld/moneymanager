// Die Gegenrichtung zum Konfigurationsexport: eine fremde Ordnung übernehmen.
//
// **Der Export war immer die leichtere Hälfte.** Hinausschreiben heisst, den eigenen Stand
// hinzustellen; hereinlesen heisst, ihn mit einem fremden zu verrechnen — eingelesene
// Kategorien treffen auf vorhandene, IDs kollidieren, Bäume gehören zusammengeführt. Das
// stand bis 2026-09-22 als offene Frage im Kopf von `konfiguration.ts`. Hier steht die
// Antwort, und sie besteht aus drei Entscheidungen:
//
// - **Verglichen wird über den NAMEN, nicht über die Id und nicht über den Pfad.** Die Id
//   aus einer fremden Datei sagt über den eigenen Bestand nichts; sie zu übernehmen hiesse,
//   auf gut Glück zu hoffen, dass sie nirgends schon vergeben ist. Der PFAD wäre die
//   genauere Wahl und ist trotzdem die falsche: läge „Miete" hier unter „Fixkosten" und
//   dort unter „Wohnen", entstünde eine ZWEITE Kategorie desselben Namens — und der Name
//   ist die Angabe, über die sonst alles aufgelöst wird, von `standardkategorienAnlegen`
//   bis zum Kategorievorschlag des Imports. Zwei gleichnamige Kategorien sind deshalb
//   kein doppelter Eintrag, sondern eine mehrdeutige Auflösung.
// - **Es wird nur ANGELEGT, nie geändert.** Was es unter diesem Namen schon gibt, bleibt
//   wie es ist — auch wenn die Datei einen anderen Charakter oder eine andere
//   Elternkategorie nennt. Eine Ordnung ist die Entscheidung dessen, dem sie gehört; ein
//   Import, der sie stillschweigend umschreibt, nimmt sie ihm weg. Abweichungen werden
//   deshalb GEZEIGT und nicht ausgeführt.
// - **Der Plan steht vor der Tat.** Erst wird gelesen und verglichen, dann sieht man, was
//   passieren würde, und erst danach passiert es. Dieselbe Form wie beim Dateiimport, und
//   aus demselben Grund: was eine Datei mit dem Bestand macht, soll man vorher wissen.
//
// Was hier NICHT steht: eine Zusammenführung der Bäume über mehrere Ebenen, ein Umhängen,
// ein Löschen. Alles drei ändert Vorhandenes, und dafür gibt es die Kategorieverwaltung.

import { FachlicherFehler, type Charakter, type Kategorie } from "../core";
import type { KategorieRepository } from "./ports";
import { EXPORT_FASSUNG, type ExportKategorie, type Konfigurationsexport } from "./konfiguration";

const CHARAKTERE: readonly string[] = ["Aufwand", "Ertrag", "Umschichtung"];

/** Was aus einer Zeile der Datei wird, wenn man sie neben den Bestand hält. */
export type Befund =
  /** Den Namen gibt es hier noch nicht — sie wird angelegt. */
  | "neu"
  /** Gibt es bereits, in derselben Form. Nichts zu tun. */
  | "vorhanden"
  /** Gibt es bereits, aber mit anderem Charakter. Bleibt, wie sie ist. */
  | "abweichend";

export interface Kategoriebefund {
  readonly name: string;
  /** Die Elternkategorie aus der DATEI, als Name — leer bei einer Hauptkategorie. */
  readonly eltern: string | null;
  readonly befund: Befund;
  readonly charakter: string;
  /** Nur bei `abweichend`: was hier steht. */
  readonly charakterImBestand?: string;
}

export interface Importplan {
  readonly fassung: number;
  readonly erzeugt: string;
  readonly befunde: readonly Kategoriebefund[];
  readonly neu: number;
  readonly vorhanden: number;
  readonly abweichend: number;
}

/**
 * Liest den Text einer Exportdatei und prüft, dass er einer ist.
 *
 * **Eine unbekannte Fassung wird ABGEWIESEN, nicht geraten.** Sie kann nur von einer
 * neueren App stammen, und was dort ein Feld bedeutet, weiss diese hier nicht. Ein
 * Import, der trotzdem läuft und die Hälfte still weglässt, ist die teurere Antwort: man
 * merkt es erst, wenn die Kategorien schon dastehen.
 */
export function konfigurationLesen(text: string): Konfigurationsexport {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new FachlicherFehler("import.keinJson");
  }
  if (!roh || typeof roh !== "object") throw new FachlicherFehler("import.keinJson");

  const datei = roh as Partial<Konfigurationsexport>;
  if (typeof datei.fassung !== "number" || !Array.isArray(datei.kategorien)) {
    throw new FachlicherFehler("import.keineKonfiguration");
  }
  if (datei.fassung > EXPORT_FASSUNG) throw new FachlicherFehler("import.fassungZuNeu");

  const kategorien = datei.kategorien.filter(
    (k): k is ExportKategorie =>
      !!k &&
      typeof k === "object" &&
      typeof (k as ExportKategorie).id === "string" &&
      typeof (k as ExportKategorie).name === "string" &&
      (k as ExportKategorie).name.trim() !== "" &&
      CHARAKTERE.includes((k as ExportKategorie).defaultCharakter),
  );

  return {
    fassung: datei.fassung,
    erzeugt: typeof datei.erzeugt === "string" ? datei.erzeugt : "",
    kategorien,
  };
}

/** Der Vergleichsschlüssel: der Name, auf Gross-/Kleinschreibung unempfindlich. */
function schluessel(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Was der Import täte — ohne ihn zu tun.
 *
 * Rein und ohne IO: wer die Teile schon geladen hat, ruft das hier direkt auf. Die
 * Reihenfolge der Datei bleibt erhalten, weil sie Eltern vor Kinder stellt (siehe
 * `inExportform`) — und damit liest sich auch die Vorschau von oben nach unten.
 */
export function importplan(
  datei: Konfigurationsexport,
  vorhandene: readonly Kategorie[],
): Importplan {
  const imBestand = new Map<string, Kategorie>();
  for (const k of vorhandene) imBestand.set(schluessel(k.name), k);

  const nameZurId = new Map<string, string>();
  for (const k of datei.kategorien) nameZurId.set(k.id, k.name);

  // Was in dieser Datei schon einmal vorkam, zählt beim zweiten Mal nicht neu: eine Datei
  // mit zwei gleichnamigen Zeilen legte sonst zwei Kategorien an, und genau das soll der
  // Namensvergleich verhindern.
  const gesehen = new Set<string>();
  const befunde: Kategoriebefund[] = [];

  for (const k of datei.kategorien) {
    const key = schluessel(k.name);
    if (gesehen.has(key)) continue;
    gesehen.add(key);

    const hier = imBestand.get(key);
    const eltern = k.elternId ? nameZurId.get(k.elternId) ?? null : null;
    if (!hier) {
      befunde.push({ name: k.name, eltern, befund: "neu", charakter: k.defaultCharakter });
    } else if (hier.defaultCharakter !== k.defaultCharakter) {
      befunde.push({
        name: k.name,
        eltern,
        befund: "abweichend",
        charakter: k.defaultCharakter,
        charakterImBestand: hier.defaultCharakter,
      });
    } else {
      befunde.push({ name: k.name, eltern, befund: "vorhanden", charakter: k.defaultCharakter });
    }
  }

  return {
    fassung: datei.fassung,
    erzeugt: datei.erzeugt,
    befunde,
    neu: befunde.filter((b) => b.befund === "neu").length,
    vorhanden: befunde.filter((b) => b.befund === "vorhanden").length,
    abweichend: befunde.filter((b) => b.befund === "abweichend").length,
  };
}

/**
 * Legt an, was fehlt — und nur das.
 *
 * **Der Plan wird hier noch einmal gerechnet**, statt den aus der Vorschau
 * entgegenzunehmen. Zwischen Ansehen und Klicken kann eine Kategorie entstanden sein, und
 * ein Plan, der auf einem Stand von vorhin fusst, legte sie ein zweites Mal an. Die
 * Vorschau ist eine Auskunft, keine Anweisung.
 *
 * **Neue Ids, nicht die aus der Datei.** Die Datei weiss nichts über diesen Bestand; ihre
 * Id könnte hier eine ganz andere Kategorie bezeichnen. Zweimal dieselbe Datei einzulesen
 * ist trotzdem folgenlos — verglichen wird über den Namen, und der zweite Lauf findet
 * alles vor.
 */
export async function konfigurationUebernehmen(
  repo: KategorieRepository,
  datei: Konfigurationsexport,
): Promise<number> {
  const vorhandene = await repo.alle();
  const nachName = new Map<string, string>();
  for (const k of vorhandene) nachName.set(schluessel(k.name), k.id);

  const nameZurDateiId = new Map<string, string>();
  for (const k of datei.kategorien) nameZurDateiId.set(k.id, k.name);

  let angelegt = 0;
  for (const k of datei.kategorien) {
    const key = schluessel(k.name);
    if (nachName.has(key)) continue;

    // Die Elternkategorie wird NICHT nebenbei angelegt: die Datei stellt Eltern vor
    // Kinder, ein fehlender Elternteil ist also eine kaputte Datei. Das Kind kommt dann
    // als Hauptkategorie herein — sichtbar und umhängbar, statt stillschweigend zu
    // fehlen.
    const elternName = k.elternId ? nameZurDateiId.get(k.elternId) : undefined;
    const elternId = elternName ? nachName.get(schluessel(elternName)) : undefined;

    const neu: Kategorie = {
      id: crypto.randomUUID(),
      name: k.name.trim(),
      defaultCharakter: k.defaultCharakter as Charakter,
      ...(elternId ? { elternId } : {}),
    };
    await repo.speichern(neu);
    nachName.set(key, neu.id);
    angelegt++;
  }
  return angelegt;
}
