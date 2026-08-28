// Use-Cases rund um die Frage „welche Buchung gehört zu welchem Vertrag?".
//
// Der Kern (`core/vertragZuordnung`) rechnet; hier wird geladen, geschrieben und
// entschieden, WANN gerechnet wird. Der Abgleich ist bewusst EIN Lauf über den ganzen
// Bestand statt eines Hakens an jeder Stelle, an der Buchungen entstehen:
//
//   • Buchungen entstehen an drei Stellen (Import, manuelle Erfassung, bezahlt-markiert)
//     — drei Haken wären drei Gelegenheiten, einen zu vergessen.
//   • Ein neu erfasster Vertrag muss RÜCKWIRKEND greifen. Sonst trüge nur das, was nach
//     dem Anlegen gebucht wurde, seine Zuordnung, und der Bestand bliebe für immer blind.
//   • Er ist idempotent und schreibt nur Deltas, kostet also nichts, wenn nichts zu tun ist.

import { standardErkennung, zuordnungAbgleich, type Cent, type Vertragszuordnung } from "../../core";
import type {
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
  VertragserkennungRepository,
  VertragszuordnungRepository,
  ZahlungsregelRepository,
} from "../ports";
import { zahlungsspuren } from "../buchung/zahlungsspuren";

export interface AbgleichDeps {
  readonly ledger: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
  readonly erkennungRepo: VertragserkennungRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
}

export interface AbgleichErgebnis {
  /** Buchungen, die (neu oder anders) einem Vertrag zugeordnet wurden. */
  readonly gesetzt: number;
  /** Buchungen, deren automatische Zuordnung wegfiel. */
  readonly entfernt: number;
}

/**
 * Rechnet die automatischen Zuordnungen neu und schreibt die Unterschiede.
 * Manuelle Zuordnungen bleiben unangetastet (siehe `zuordnungAbgleich`).
 */
export async function zuordnungenAbgleichen(deps: AbgleichDeps): Promise<AbgleichErgebnis> {
  const [spuren, erkennungen, bestand] = await Promise.all([
    zahlungsspuren(deps.ledger, deps.umsatzRepo),
    deps.erkennungRepo.alle(),
    deps.zuordnungRepo.alle(),
  ]);

  const { setzen, entfernen } = zuordnungAbgleich(erkennungen, spuren, bestand);
  for (const z of setzen) await deps.zuordnungRepo.speichern(z);
  for (const id of entfernen) await deps.zuordnungRepo.loeschen(id);
  return { gesetzt: setzen.length, entfernt: entfernen.length };
}

/**
 * Buchungs-ID → Anbietername des Vertrags, dem sie gehört.
 *
 * Die Zuordnung steht seit jeher an der Buchung, sichtbar war sie aber nur im
 * Buchungsdialog — man musste eine Zeile öffnen, um zu erfahren, ob sie zu einem Vertrag
 * gehört. In jeder Liste sah eine Vertragszahlung damit aus wie jede andere Ausgabe, und
 * die Frage „wovon ist das eigentlich der Vertrag" war nur einzeln zu beantworten.
 *
 * Der NAME und nicht bloss ein Ja/Nein: „gehört zu einem Vertrag" ist die uninteressante
 * Hälfte der Auskunft. Welcher, sagt in einer Liste alles — und es kostet dieselbe
 * Abfrage.
 *
 * Ausdrücklich NUR eindeutige Zuordnungen: eine Zeile mit `vertragId: null` ist die
 * Aussage „gehört zu keinem Vertrag" (siehe `Vertragszuordnung`) und trägt hier nichts.
 */
export async function vertragsnamenLaden(
  zuordnungRepo: VertragszuordnungRepository,
  vertragRepo: VertragRepository,
): Promise<ReadonlyMap<string, string>> {
  const [zuordnungen, vertraege] = await Promise.all([zuordnungRepo.alle(), vertragRepo.alle()]);
  const anbieter = new Map(vertraege.map((v) => [v.id, v.anbieter]));
  const raus = new Map<string, string>();
  for (const z of zuordnungen) {
    if (!z.vertragId) continue;
    const name = anbieter.get(z.vertragId);
    // Ein Verweis ins Leere wird ÜBERGANGEN und nicht als leere Pille gezeigt: eine
    // Markierung ohne Namen behauptet etwas und sagt nichts.
    if (name) raus.set(z.istbuchungId, name);
  }
  return raus;
}

/**
 * Zuordnung von Hand setzen: diese Buchung gehört zu diesem Vertrag. `vertragId: null`
 * heißt „gehört ausdrücklich zu keinem Vertrag" — beides überlebt jeden Abgleich.
 */
export async function zuordnungVonHand(
  repo: VertragszuordnungRepository,
  istbuchungId: string,
  vertragId: string | null,
): Promise<Vertragszuordnung> {
  const z: Vertragszuordnung = { istbuchungId, vertragId, herkunft: "manuell" };
  await repo.speichern(z);
  return z;
}

/**
 * Die Handentscheidung zurücknehmen: der Eintrag verschwindet, und beim nächsten
 * Abgleich entscheidet wieder die Regel. Der Rückweg, ohne den „manuell" eine
 * Einbahnstraße wäre.
 */
export async function zuordnungZuruecksetzen(
  repo: VertragszuordnungRepository,
  istbuchungId: string,
): Promise<void> {
  await repo.loeschen(istbuchungId);
}

/**
 * Legt die Standard-Erkennungsregel für einen Vertrag an — aber nur, wenn es noch keine
 * gibt. Eine vorhandene Regel bleibt unberührt, auch wenn der Vertrag geändert wird:
 * sie kann von Hand nachgesteuert worden sein (engere Betragsspanne, zusätzlicher
 * Schlüssel, Zeitraum), und ein Namenswechsel im Vertrag darf das nicht wegwischen.
 */
export async function erkennungSicherstellen(
  repo: VertragserkennungRepository,
  vertragId: string,
  anbieter: string,
  betrag: Cent,
  glaeubigerId?: string,
): Promise<void> {
  const vorhanden = (await repo.alle()).some((e) => e.vertragId === vertragId);
  if (vorhanden) return;
  await repo.speichern(standardErkennung(vertragId, anbieter, betrag, glaeubigerId));
}

/**
 * Zieht fehlende Erkennungsregeln nach: jeder Vertrag ohne Regel bekommt die
 * Standardregel aus seinem Anbieternamen und dem Betrag seiner Zahlungsregel.
 *
 * Warum es das gibt: Verträge sind älter als die Zuordnung. Ohne diesen Schritt trüge
 * der gesamte Bestand keine Regel und damit keine einzige Zuordnung — die Automatik
 * begänne erst beim nächsten neu erfassten Vertrag zu wirken. Läuft danach folgenlos
 * mit, weil `erkennungSicherstellen` Vorhandenes nicht anfasst; sie ist damit zugleich
 * die Selbstheilung für einen Vertrag, der auf irgendeinem Weg ohne Regel entstand.
 *
 * Liefert die Zahl der neu angelegten Regeln — Null heißt „nichts zu tun".
 */
export async function erkennungenNachziehen(
  vertragRepo: VertragRepository,
  regelRepo: ZahlungsregelRepository,
  erkennungRepo: VertragserkennungRepository,
): Promise<number> {
  const [vertraege, regeln, erkennungen] = await Promise.all([
    vertragRepo.alle(),
    regelRepo.alle(),
    erkennungRepo.alle(),
  ]);
  const hat = new Set(erkennungen.map((e) => e.vertragId));
  const betragVon = new Map<string, Cent>();
  for (const r of regeln) if (r.vertragId) betragVon.set(r.vertragId, r.betrag);

  let angelegt = 0;
  for (const v of vertraege) {
    if (hat.has(v.id)) continue;
    // Ohne Zahlungsregel gibt es keinen Betrag — dann eben eine Regel ohne Spanne.
    await erkennungRepo.speichern(standardErkennung(v.id, v.anbieter, betragVon.get(v.id) ?? 0));
    angelegt++;
  }
  return angelegt;
}

/**
 * Räumt beim Löschen eines Vertrags hinter ihm auf: seine Regel und alle Zuordnungen,
 * die auf ihn zeigen — auch die manuellen. Bliebe eine stehen, zeigte sie ins Leere und
 * die Buchung trüge dauerhaft die Kennzeichnung eines Vertrags, den es nicht mehr gibt.
 */
export async function vertragszuordnungenAbraeumen(
  erkennungRepo: VertragserkennungRepository,
  zuordnungRepo: VertragszuordnungRepository,
  vertragId: string,
): Promise<void> {
  await erkennungRepo.loeschen(vertragId);
  const betroffen = (await zuordnungRepo.alle()).filter((z) => z.vertragId === vertragId);
  for (const z of betroffen) await zuordnungRepo.loeschen(z.istbuchungId);
}
