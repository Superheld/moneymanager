// Use-Cases für Stammdaten — anlegen mit Validierung (Supporting Domain, bewusst
// einfach). ID-Erzeugung lebt hier (nicht im Core, der pure bleibt).

import {
  FachlicherFehler,
  ibanGueltig,
  wuerdeZyklusErzeugen,
  type Cent,
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

export interface KontoEingabe {
  bezeichnung: string;
  typ: Kontotyp;
  iban?: string;
  inhaberIds?: string[];
  saldo?: Cent; // Minor Units (die UI parst währungsgerecht)
}

export async function kontoAnlegen(
  repo: ZahlungskontoRepository,
  eingabe: KontoEingabe,
  id?: string,
): Promise<Zahlungskonto> {
  const bezeichnung = eingabe.bezeichnung.trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");
  const iban = eingabe.iban?.trim();
  if (iban && !ibanGueltig(iban)) throw new FachlicherFehler("iban.ungueltig");
  const konto: Zahlungskonto = {
    id: id ?? crypto.randomUUID(),
    bezeichnung,
    typ: eingabe.typ,
    iban: iban || undefined,
    inhaberIds: eingabe.inhaberIds ?? [],
    saldo: eingabe.saldo ?? 0,
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
  id?: string,
): Promise<Kategorie> {
  const name = eingabe.name.trim();
  if (!name) throw new FachlicherFehler("name.fehlt");

  const kid = id ?? crypto.randomUUID();
  if (eingabe.elternId) {
    const bestehende = await repo.alle();
    // Beim Bearbeiten existiert der Knoten schon; sonst für die Prüfung ergänzen.
    const mitNeu = bestehende.some((k) => k.id === kid)
      ? bestehende
      : [...bestehende, { id: kid, name, defaultCharakter: eingabe.defaultCharakter }];
    if (wuerdeZyklusErzeugen(mitNeu, kid, eingabe.elternId)) {
      throw new FachlicherFehler("kategorie.zyklus");
    }
  }

  const kategorie: Kategorie = {
    id: kid,
    name,
    elternId: eingabe.elternId || undefined,
    defaultCharakter: eingabe.defaultCharakter,
  };
  await repo.speichern(kategorie);
  return kategorie;
}
