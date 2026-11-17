// Use-Case für eine Person — anlegen mit Validierung (Supporting Domain, bewusst
// einfach). ID-Erzeugung lebt hier (nicht im Core, der pure bleibt).
//
// Bis 2026-11-17 standen hier auch Konto und Kategorie. Sie liegen jetzt in ihren Bereichen
// (`konten/kontoAnlegen.ts`, `kategorien/kategorieAnlegen.ts`): die Stammdaten stehen in
// der Rangfolge zuunterst und dürfen weder das Konto noch den Kategorienbaum kennen.

import { FachlicherFehler, type Person } from "../../core";
import type { PersonRepository } from "../ports";

export interface PersonEingabe {
  name: string;
  geburtsdatum?: string;
  rolle?: string;
}

export async function personAnlegen(
  repo: PersonRepository,
  eingabe: PersonEingabe,
  id?: string,
): Promise<Person> {
  const name = eingabe.name.trim();
  if (!name) throw new FachlicherFehler("name.fehlt");
  const person: Person = {
    id: id ?? crypto.randomUUID(),
    name,
    geburtsdatum: eingabe.geburtsdatum?.trim() || undefined,
    rolle: eingabe.rolle?.trim() || undefined,
  };
  await repo.speichern(person);
  return person;
}
