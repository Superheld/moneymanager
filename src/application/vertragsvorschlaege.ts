// Vertragsvorschläge — führt zusammen, was die Erkennung braucht, und blendet aus, was
// schon erfasst ist.
//
// Die Erkennung selbst (`core/vertragErkennung`) ist eine reine Funktion. Hier liegt
// nur, was sie nicht wissen kann: Empfänger und Gläubiger-ID stehen am `Umsatz`
// (Import-Kontext), nicht an der `IstBuchung` — verbunden über `umsatz.istbuchungId`.
// Und ob es zu einem Kandidaten längst einen Vertrag gibt, weiß erst das Repository.

import { anbieterSchluessel, vertragskandidaten } from "../core";
import type { Vertragskandidat, Zahlungsspur } from "../core";
import type {
  EinstellungenRepository,
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
} from "./ports";

export interface VorschlagsOptionen {
  /** Auch Kandidaten zeigen, deren letzte Zahlung lange her ist. */
  auchBeendete?: boolean;
  /** Weggeklickte Kandidaten (siehe `ignorierteSchluessel`). */
  ignoriert?: ReadonlySet<string>;
}

/**
 * Merkzettel der weggeklickten Vorschläge. Ohne ihn schlägt die Karte dauerhaft
 * dasselbe vor — der schnellste Weg, ein Vorschlagssystem unbrauchbar zu machen.
 *
 * Liegt als JSON in der generischen Einstellungs-Tabelle, nicht in einer eigenen:
 * es ist eine Bedien-Notiz, kein Fachaggregat, und braucht keine Migration.
 */
const SCHLUESSEL_IGNORIERT = "vertragsvorschlag.ignoriert";

export async function ignorierteSchluessel(repo: EinstellungenRepository): Promise<Set<string>> {
  const roh = (await repo.lesen())[SCHLUESSEL_IGNORIERT];
  if (!roh) return new Set();
  try {
    const gelesen: unknown = JSON.parse(roh);
    // Defensiv: ein kaputter Eintrag darf die Vorschläge nicht ausfallen lassen.
    return new Set(Array.isArray(gelesen) ? gelesen.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export async function vorschlagIgnorieren(
  repo: EinstellungenRepository,
  schluessel: string,
): Promise<void> {
  const menge = await ignorierteSchluessel(repo);
  menge.add(schluessel);
  await repo.schreiben(SCHLUESSEL_IGNORIERT, JSON.stringify([...menge]));
}

/** Alle weggeklickten Vorschläge wieder zeigen. */
export async function ignorierteZuruecksetzen(repo: EinstellungenRepository): Promise<void> {
  await repo.schreiben(SCHLUESSEL_IGNORIERT, "[]");
}

/**
 * Vertragskandidaten aus dem gebuchten Bestand, ohne die bereits erfassten.
 *
 * Ein bestehender Vertrag verdeckt den Kandidaten über den normalisierten Anbieternamen.
 * Bewusst nicht über die Gläubiger-ID: die trägt der Vertrag gar nicht — und der Name
 * ist genau das Feld, das der Nutzer beim Bestätigen übernommen hat.
 */
export async function vertragsvorschlaege(
  ledger: LedgerPort,
  umsatzRepo: UmsatzRepository,
  vertragRepo: VertragRepository,
  heute: string,
  optionen: VorschlagsOptionen = {},
): Promise<Vertragskandidat[]> {
  const [buchungen, umsaetze, vertraege] = await Promise.all([
    ledger.alle(),
    umsatzRepo.alle(),
    vertragRepo.alle(),
  ]);

  // Ein Umsatz je Buchung; bei mehreren gewinnt der erste — Empfänger und Gläubiger-ID
  // sind bei allen dieselben, sie stammen aus derselben Quellzeile.
  const umsatzZuBuchung = new Map<string, (typeof umsaetze)[number]>();
  for (const u of umsaetze) {
    if (u.istbuchungId && !umsatzZuBuchung.has(u.istbuchungId)) umsatzZuBuchung.set(u.istbuchungId, u);
  }

  const spuren: Zahlungsspur[] = buchungen.map((b) => {
    const u = umsatzZuBuchung.get(b.id);
    return {
      id: b.id,
      datum: b.datum,
      betrag: b.betrag,
      gegenpartei: u?.gegenpartei ?? "",
      glaeubigerId: u?.glaeubigerId,
      kategorieId: b.kategorieId,
      kontoId: b.kontoId,
      charakter: b.charakter,
    };
  });

  const erfasst = new Set(vertraege.map((v) => anbieterSchluessel(v.anbieter)));
  const ignoriert = optionen.ignoriert ?? new Set<string>();
  return vertragskandidaten(spuren, heute, { auchBeendete: optionen.auchBeendete }).filter(
    (k) =>
      !ignoriert.has(k.schluessel) &&
      !erfasst.has(anbieterSchluessel(k.anbieter)) &&
      !erfasst.has(k.schluessel),
  );
}
