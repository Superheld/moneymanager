// Die zwei Handlungen rund um den Kontostands-Anker: einen setzen, und einmal abgleichen.
//
// Beides sind Schreibfälle und stehen deshalb hier statt in `kontensichten` — die rechnet
// nur. Der Abruf setzt seine Anker selbst (siehe `fints/abrufAusfuehren`); was hier steht,
// ist der Weg von Hand.

import {
  anfangsbestandAusAnker,
  ankerAbweichung,
  istCent,
  juengsterAnker,
  parseIso,
  FachlicherFehler,
  type Cent,
  type Kontostandsanker,
} from "../core";
import type { KontostandsankerRepository, LedgerPort, ZahlungskontoRepository } from "./ports";

export interface AnkerDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly ledger: LedgerPort;
  readonly ankerRepo: KontostandsankerRepository;
}

/**
 * Kassensturz: „am 20.08. lagen 47,50 € im Portemonnaie."
 *
 * Für Konten ohne Bankverbindung ist das die einzige unabhängige Aussage, die es je geben
 * wird — und sie ist genauso viel wert wie eine Bankmeldung. Datentechnisch ist es
 * derselbe Anker, nur mit anderer Herkunft.
 */
export async function kontostandFesthalten(
  deps: Pick<AnkerDeps, "ankerRepo">,
  eingabe: { kontoId: string; datum: string; betrag: Cent },
  jetzt: () => string = () => new Date().toISOString(),
): Promise<Kontostandsanker> {
  if (!eingabe.kontoId) throw new FachlicherFehler("anker.kontoFehlt");
  if (!istCent(eingabe.betrag)) throw new FachlicherFehler("anker.betragUngueltig");
  // Die FORM prüft der Aufrufer, die EXISTENZ der Kern — „2026-02-31" wirft hier.
  parseIso(eingabe.datum);
  const anker: Kontostandsanker = {
    kontoId: eingabe.kontoId,
    datum: eingabe.datum,
    herkunft: "hand",
    betrag: eingabe.betrag,
    erfasstAm: jetzt(),
  };
  await deps.ankerRepo.speichern(anker);
  return anker;
}

export interface Abgleichergebnis {
  readonly alt: Cent;
  readonly neu: Cent;
  /** Was verschoben wurde — dieselbe Zahl, die vorher als Abweichung dastand. */
  readonly differenz: Cent;
  readonly anker: Kontostandsanker;
}

/**
 * Den Anfangsbestand EINMALIG so setzen, dass die Rechnung den jüngsten Anker trifft.
 *
 * Der Anfangsbestand ist keine Beobachtung, sondern ein Platzhalter für die Historie vor
 * dem ersten Import — bei einem Konto, das seit 2015 läuft und dessen Daten 2021
 * beginnen, ist er zwangsläufig geraten. Solange das so ist, darf die Differenz zur Bank
 * dort hineinwandern: sie ist mit einiger Wahrscheinlichkeit genau diese fehlende
 * Vorgeschichte.
 *
 * **Einmalig und auf Zuruf, nicht bei jeder Anzeige.** Sobald abgeglichen wurde, ist jede
 * neue Abweichung ein echter Fehler — eine fehlende Buchung, eine doppelte, ein falscher
 * Betrag. Würde still weitergerechnet, wäre der Detektor kaputt, den man gerade erst
 * scharfgestellt hat.
 *
 * Was danach noch schiefstehen kann, sagt `abweichungsfenster`: es rechnet Anker gegen
 * Anker und ist vom Anfangsbestand unabhängig.
 */
export async function anfangsbestandAbgleichen(
  deps: AnkerDeps,
  kontoId: string,
): Promise<Abgleichergebnis> {
  const [konten, buchungen, anker] = await Promise.all([
    deps.kontoRepo.alle(),
    deps.ledger.alle(),
    deps.ankerRepo.alle(),
  ]);
  const konto = konten.find((k) => k.id === kontoId);
  if (!konto) throw new FachlicherFehler("anker.kontoFehlt");
  const juengster = juengsterAnker(anker, kontoId);
  if (!juengster) throw new FachlicherFehler("anker.keinAnker");

  const differenz = ankerAbweichung(konto, buchungen, juengster);
  const neu = anfangsbestandAusAnker(buchungen, juengster);
  if (differenz !== 0) await deps.kontoRepo.speichern({ ...konto, saldo: neu });
  return { alt: konto.saldo, neu, differenz, anker: juengster };
}
