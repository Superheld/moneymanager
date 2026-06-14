// Use-Cases für Stammdaten — anlegen mit Validierung (Supporting Domain, bewusst
// einfach). ID-Erzeugung lebt hier (nicht im Core, der pure bleibt).

import {
  ibanGueltig,
  wuerdeZyklusErzeugen,
  type Charakter,
  type Kategorie,
  type Kontotyp,
  type Person,
  type Zahlungskonto,
} from "../core";
import type {
  KategorieRepository,
  PersonRepository,
  ZahlungskontoRepository,
} from "./ports";

export interface PersonEingabe {
  name: string;
  geburtsdatum?: string;
  rolle?: string;
}

export async function personAnlegen(
  repo: PersonRepository,
  eingabe: PersonEingabe,
): Promise<Person> {
  const name = eingabe.name.trim();
  if (!name) throw new Error("Bitte einen Namen angeben.");
  const person: Person = {
    id: crypto.randomUUID(),
    name,
    geburtsdatum: eingabe.geburtsdatum?.trim() || undefined,
    rolle: eingabe.rolle?.trim() || undefined,
  };
  await repo.speichern(person);
  return person;
}

export interface KontoEingabe {
  bezeichnung: string;
  typ: Kontotyp;
  iban?: string;
  inhaberIds?: string[];
}

export async function kontoAnlegen(
  repo: ZahlungskontoRepository,
  eingabe: KontoEingabe,
): Promise<Zahlungskonto> {
  const bezeichnung = eingabe.bezeichnung.trim();
  if (!bezeichnung) throw new Error("Bitte eine Bezeichnung angeben.");
  const iban = eingabe.iban?.trim();
  if (iban && !ibanGueltig(iban)) throw new Error("Die IBAN ist ungültig.");
  const konto: Zahlungskonto = {
    id: crypto.randomUUID(),
    bezeichnung,
    typ: eingabe.typ,
    iban: iban || undefined,
    inhaberIds: eingabe.inhaberIds ?? [],
  };
  await repo.speichern(konto);
  return konto;
}

export interface KategorieEingabe {
  name: string;
  elternId?: string;
  defaultCharakter: Charakter;
}

export async function kategorieAnlegen(
  repo: KategorieRepository,
  eingabe: KategorieEingabe,
): Promise<Kategorie> {
  const name = eingabe.name.trim();
  if (!name) throw new Error("Bitte einen Namen angeben.");

  const id = crypto.randomUUID();
  if (eingabe.elternId) {
    const bestehende = await repo.alle();
    // Die neue Kategorie ist noch nicht in der Liste — für die Prüfung ergänzen.
    const mitNeu = [...bestehende, { id, name, defaultCharakter: eingabe.defaultCharakter }];
    if (wuerdeZyklusErzeugen(mitNeu, id, eingabe.elternId)) {
      throw new Error("Diese Elternkategorie würde einen Zyklus erzeugen.");
    }
  }

  const kategorie: Kategorie = {
    id,
    name,
    elternId: eingabe.elternId || undefined,
    defaultCharakter: eingabe.defaultCharakter,
  };
  await repo.speichern(kategorie);
  return kategorie;
}
