// Ein Konto anlegen — mit Validierung. ID-Erzeugung lebt hier (nicht im Core, der pure
// bleibt). Bis 2026-11-17 in `stammdaten/stammdatenAnlegen.ts`; das Konto steht in der
// Rangfolge über den Stammdaten, sein Anlegen gehört deshalb zu ihm.

import {
  FachlicherFehler,
  ibanGueltig,
  klasseVorschlag,
  type Cent,
  type Kontoklasse,
  type Kontotyp,
  type Zahlungskonto,
} from "../../core";
import type { ZahlungskontoRepository } from "../ports";

export interface KontoEingabe {
  bezeichnung: string;
  typ: Kontotyp;
  /** Fehlt sie, wird sie aus dem Typ vorgeschlagen — änderbar bleibt sie immer. */
  klasse?: Kontoklasse;
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
    klasse: eingabe.klasse ?? klasseVorschlag(eingabe.typ),
    iban: iban || undefined,
    inhaberIds: eingabe.inhaberIds ?? [],
    saldo: eingabe.saldo ?? 0,
  };
  await repo.speichern(konto);
  return konto;
}
