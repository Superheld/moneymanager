// Konto-Brücke (rein): die Quell-Konten eines Imports ↔ Zahlungskonten der App.
// Die Quelle nennt das Konto selbst (Referenzkonto-Schlüssel + Name); existiert ein
// Konto mit gleicher IBAN, wird verknüpft, sonst ein Anlege-Vorschlag erzeugt. Den Typ
// raten wir aus dem Namen (Finanzguru: „Girokonto", „Tagesgeldkonto", „Kreditkarte …").
// Nicht-IBAN-Schlüssel (z. B. FG-internes „Bargeld") tragen keine iban.

import { ibanGueltig, normalisiereIban, type Kontotyp, type Zahlungskonto } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";

export interface KontoMatch {
  /** Roh-Schlüssel aus der Quelle (Referenzkonto: IBAN oder quellen-interne ID). */
  readonly quelleKey: string;
  /** Name aus der Quelle, z. B. „Girokonto". */
  readonly quelleName?: string;
  /** Anzahl Buchungen dieses Quell-Kontos im Import. */
  readonly anzahl: number;
  /** Verknüpftes bestehendes Konto (per IBAN gefunden), falls vorhanden. */
  readonly kontoId?: string;
  /** Vorschlag zum Neuanlegen, falls kein bestehendes Konto matcht. */
  readonly neu?: { readonly bezeichnung: string; readonly typ: Kontotyp; readonly iban?: string };
}

export function typAusName(name: string | undefined): Kontotyp {
  const n = (name ?? "").toLowerCase();
  if (n.includes("kreditkarte") || n.includes("credit")) return "Kreditkarte";
  if (n.includes("tagesgeld")) return "Tagesgeld";
  if (n.includes("bargeld") || n.includes("kasse")) return "Bargeld";
  return "Giro";
}

export function kontoMatchVorschlag(
  rohUmsaetze: readonly RohUmsatz[],
  bestehende: readonly Zahlungskonto[],
): KontoMatch[] {
  const perIban = new Map<string, Zahlungskonto>();
  for (const k of bestehende) if (k.iban) perIban.set(normalisiereIban(k.iban), k);

  const gruppen = new Map<string, { name?: string; anzahl: number }>();
  for (const u of rohUmsaetze) {
    const key = u.kontoIban ?? "";
    const g = gruppen.get(key) ?? { name: u.kontoName, anzahl: 0 };
    g.anzahl++;
    if (!g.name && u.kontoName) g.name = u.kontoName;
    gruppen.set(key, g);
  }

  return [...gruppen.entries()].map(([quelleKey, g]): KontoMatch => {
    const treffer = perIban.get(normalisiereIban(quelleKey));
    if (treffer) return { quelleKey, quelleName: g.name, anzahl: g.anzahl, kontoId: treffer.id };
    const istIban = ibanGueltig(quelleKey);
    return {
      quelleKey,
      quelleName: g.name,
      anzahl: g.anzahl,
      neu: {
        bezeichnung: g.name ?? quelleKey,
        typ: typAusName(g.name),
        iban: istIban ? normalisiereIban(quelleKey) : undefined,
      },
    };
  });
}
