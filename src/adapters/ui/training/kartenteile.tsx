// Was die Karten der Kategorisierung gemeinsam haben: die geladenen Daten, die Hilfen,
// die jede Inhalts-Komponente bekommt, und zwei kleine Bausteine. Bis 2026-11-10 stand
// das alles mit den vier Karten in einer Datei (`KategorisierungCards.tsx`).

import { type ReactNode } from "react";
import { type Trainingslauf, type Merkmalsherkunft } from "../../../application";
import { type Materialbefund } from "../../../application/kategorien/trainingsmaterial";
import {
  type Modellzustand,
} from "../../../application/kategorien/klassifikatorTraining";
import type { GespeicherterAusschluss } from "../../../application/ports";

/**
 * Was blindes Raten träfe. Der Typ steht hier und nicht im Kern als eigener Name: er ist
 * die Rückgabe EINER Funktion, und ein Alias dafür wäre ein Wort mehr ohne Aussage.
 */
export type Grundlinie = { kategorieId: string; genauigkeit: number };

/** Alles, was die vier Karten gemeinsam brauchen. */
export interface Daten {
  readonly material: Materialbefund;
  readonly zustand: Modellzustand;
  readonly herkuenfte: readonly Merkmalsherkunft[];
  readonly ausschluesse: readonly GespeicherterAusschluss[];
  /** Die aufgezeichneten Trainingsläufe, neuester zuerst. */
  readonly laeufe: readonly Trainingslauf[];
}

/** Was alle Inhalts-Komponenten gemeinsam bekommen. */
export interface Hilfe {
  t: (key: string, options?: Record<string, unknown>) => string;
  daten: Daten | null;
  kategorieName: Map<string, string>;
  zahl: (n: number) => string;
  prozent: (x: number) => string;
}

// ---------------------------------------------------------------- 1 · Trainingsdaten

/** Überschrift plus Inhalt, optional mit einem Knopf rechts daneben. */
export function Abschnitt({ titel, neben, children }: { titel: string; neben?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginTop: "var(--sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-2)" }}>
        <div style={{ fontWeight: "var(--fw-bold)" }}>{titel}</div>
        {neben}
      </div>
      {children}
    </div>
  );
}

/**
 * „Seitdem sind n Beispiele dazugekommen/weggefallen." Singular und Plural als eigene
 * Schlüssel statt über die Plural-Mechanik von i18next: die legt den Basis-Schlüssel
 * nicht an, und der Vollständigkeits-Test über alle verwendeten Schlüssel würde ihn
 * dauerhaft als fehlend melden.
 */
export function zustandsText(t: Hilfe["t"], zuwachs: number, zahl: (n: number) => string): string {
  const n = Math.abs(zuwachs);
  const stamm = `einstellungen.lernmaterial.${zuwachs > 0 ? "zuwachs" : "schwund"}`;
  return n === 1 ? t(`${stamm}Eins`) : t(`${stamm}Viele`, { anzahl: zahl(n) });
}
