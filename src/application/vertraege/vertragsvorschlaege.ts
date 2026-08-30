// Vertragsvorschläge — führt zusammen, was die Erkennung braucht, und blendet aus, was
// schon erfasst ist.
//
// Die Erkennung selbst (`core/vertragErkennung`) ist eine reine Funktion. Hier liegt
// nur, was sie nicht wissen kann: Empfänger und Gläubiger-ID stehen am `Umsatz`
// (Import-Kontext), nicht an der `IstBuchung` — verbunden über `umsatz.istbuchungId`.
// Und ob es zu einem Kandidaten längst einen Vertrag gibt, weiß erst das Repository.

import { ignorierenVermerken, ignorierteLesen } from "../einstellungen";
import { anbieterSchluessel, vertragskandidaten } from "../../core";
import type { Vertragskandidat } from "../../core";
import type {
  EinstellungenRepository,
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
} from "../ports";
import { zahlungsspuren } from "../buchung/zahlungsspuren";

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
  return ignorierteLesen(repo, SCHLUESSEL_IGNORIERT);
}

export async function vorschlagIgnorieren(
  repo: EinstellungenRepository,
  schluessel: string,
): Promise<void> {
  await ignorierenVermerken(repo, SCHLUESSEL_IGNORIERT, schluessel);
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
  const [spuren, vertraege] = await Promise.all([
    zahlungsspuren(ledger, umsatzRepo),
    vertragRepo.alle(),
  ]);

  const erfasst = new Set(vertraege.map((v) => anbieterSchluessel(v.anbieter)));
  const ignoriert = optionen.ignoriert ?? new Set<string>();
  return vertragskandidaten(spuren, heute, { auchBeendete: optionen.auchBeendete }).filter(
    (k) =>
      !ignoriert.has(k.schluessel) &&
      !erfasst.has(anbieterSchluessel(k.anbieter)) &&
      !erfasst.has(k.schluessel),
  );
}
