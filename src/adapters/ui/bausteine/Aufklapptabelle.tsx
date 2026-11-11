// Was unter einer Zeile aufklappt — EINE Fläche und EINE Tabelle für alle Stellen.
//
// Bis 2026-11-09 gab es davon drei Fassungen: die Buchungen eines Budgets
// (`BudgetPostenliste`, als Flex-Zeilen), die Buchungen einer Kategorie in der Analyse
// (als eigene `<table>`, mit weissem Kopf auf getönter Fläche) und die Posten der
// Monatskarten (wieder Flex-Zeilen, mit festen 320 px statt der Zeilenregel). Drei
// Polsterungen, drei Zeilenhöhen, drei Köpfe — dasselbe Ding sah an jeder Stelle anders
// aus, und eine Verbesserung an einer Stelle erreichte die anderen nie.
//
// Zwei Teile, weil es zwei Bedürfnisse gibt:
//
//   • `Aufklappflaeche` — nur die Fläche: getönt, gerundet, mit Deckel nach der
//     Zeilenregel aus `aufklappen.ts`. Für Inhalt, der an den Spalten der Zeile DARÜBER
//     fluchten muss (die Monatskarten) und deshalb kein eigenes Tabellenraster haben darf.
//   • `Aufklapptabelle` — Fläche plus Tabelle: Kopf, der beim Scrollen stehen bleibt,
//     klickbare Zeilen, optionaler Fuss. Für alles, was eine Liste von Buchungen zeigt.
//
// Bewusst KEINE Karte: die Fläche hängt unter einer Zeile, die schon in einer steckt
// (siehe `ui/CLAUDE.md`, „keine Karte IN einer Karte").

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { AUFKLAPP_ZEILEN_BREIT, aufklappHoehe } from "./aufklappen";

/** Die gerechnete Zeilenhöhe: 6 px Polster oben und unten, 12,5 px Schrift, Haarlinie. */
const ZEILENHOEHE = 32;
/** Der Kopf ist niedriger, seine Schrift kleiner — er gehört zusätzlich in den Deckel. */
const KOPFHOEHE = 28;

const FLAECHE: CSSProperties = {
  background: "var(--surface-2, rgba(0,0,0,.015))",
  borderRadius: "var(--r-md)",
  padding: "2px 8px",
  margin: "6px 0 10px",
  overflowY: "auto",
};

/** Wie ein Tabellenkopf in `DataTable`, nur ohne Sortierung. */
export const AUFKLAPP_KOPFSTIL: CSSProperties = {
  fontSize: "var(--fs-2xs)",
  fontWeight: "var(--fw-bold)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "var(--ink-3)",
};

export function Aufklappflaeche({
  zeilen = AUFKLAPP_ZEILEN_BREIT,
  zeilenhoehe = ZEILENHOEHE,
  kopfhoehe = 0,
  rand,
  children,
}: {
  /** Wie viele Zeilen sichtbar bleiben, bevor gescrollt wird (siehe `aufklappen.ts`). */
  zeilen?: number;
  /** Nur für eigenen Inhalt mit anderer Zeilenhöhe — die Tabelle setzt beides selbst. */
  zeilenhoehe?: number;
  kopfhoehe?: number;
  /**
   * Seitlicher Rand, falls der Inhalt mit der Zeile darüber fluchten soll: ein negativer
   * Wert hebt das Innenpolster auf (die Monatskarten).
   */
  rand?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        ...FLAECHE,
        ...(rand ? { marginLeft: rand, marginRight: rand } : {}),
        maxHeight: aufklappHoehe(zeilen, zeilenhoehe, kopfhoehe) + 4,
      }}
    >
      {children}
    </div>
  );
}

export interface Aufklappspalte<T> {
  readonly key: string;
  readonly label: ReactNode;
  readonly align?: "left" | "right";
  /** Gedämpft (Nebeninformation wie Zweck oder Konto). */
  readonly gedimmt?: boolean;
  /** Fett (der Bezeichner, an dem das Auge entlangliest). */
  readonly fett?: boolean;
  /** Feste Breite, damit Kopf und Zeilen fluchten — etwa für das Datum. */
  readonly breite?: string;
  /** Kappt den Inhalt auf eine Zeile mit Auslassung; der volle Text gehört in `title`. */
  readonly kappen?: boolean;
  readonly render: (zeile: T) => ReactNode;
}

const ZELLE: CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--line-soft)",
  color: "var(--ink)",
  verticalAlign: "baseline",
};

export function Aufklapptabelle<T>({
  spalten,
  zeilen,
  schluessel,
  onZeile,
  zeilenTitel,
  kopf = true,
  fuss,
  leer,
  mehr,
  sichtbar = AUFKLAPP_ZEILEN_BREIT,
}: {
  spalten: readonly Aufklappspalte<T>[];
  zeilen: readonly T[];
  schluessel: (zeile: T, index: number) => string;
  /**
   * Klick auf eine Zeile — sie öffnet die Buchung.
   *
   * Optional, weil die Liste damit von einer ANZEIGE zu einem Weg wird, und wer sie
   * einbaut, muss den Dialog dahinter auch anbieten. Ohne die Angabe bleiben die Zeilen
   * Text; eine Zeile, die nach Klick aussieht und nichts tut, wäre schlechter als keine.
   */
  onZeile?: (zeile: T) => void;
  /** Der Hover-Text einer klickbaren Zeile — was der Klick tut. */
  zeilenTitel?: string;
  /** Spaltenköpfe. Aus, wo die Zeile darüber schon sagt, was darunter kommt. */
  kopf?: boolean;
  /** Eine Zeile unter allem, etwa die Summe. Sie steht ausserhalb der Spalten. */
  fuss?: ReactNode;
  /** Was steht, wenn es keine Zeilen gibt. */
  leer: ReactNode;
  /** Ein Hinweis unter der Tabelle, etwa „und 12 weitere". */
  mehr?: ReactNode;
  /** Wie viele Zeilen sichtbar bleiben (siehe `aufklappen.ts`). */
  sichtbar?: number;
}) {
  if (zeilen.length === 0) {
    return (
      <div className="muted" style={{ fontSize: "var(--fs-xs)", padding: "8px 0 2px" }}>
        {leer}
      </div>
    );
  }

  const tastatur = (z: T) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onZeile?.(z);
    }
  };

  return (
    <Aufklappflaeche zeilen={sichtbar} kopfhoehe={kopf ? KOPFHOEHE : 0}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-ui)", tableLayout: "auto" }}>
        {kopf && (
          <thead>
            <tr>
              {spalten.map((s) => (
                <th
                  key={s.key}
                  style={{
                    ...AUFKLAPP_KOPFSTIL,
                    textAlign: s.align === "right" ? "right" : "left",
                    padding: "6px 8px 5px",
                    borderBottom: "1px solid var(--line)",
                    width: s.breite,
                    // Fest beim Scrollen. Der Hintergrund muss mit — und zwar DERSELBE wie
                    // die Fläche, sonst steht ein weisser Balken auf getöntem Grund.
                    position: "sticky",
                    top: 0,
                    background: "var(--surface-2, var(--surface))",
                    zIndex: 1,
                  }}
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {zeilen.map((z, i) => (
            // Die Zeile ist ein `tr` und kann kein Knopf sein. Damit sie trotzdem mit der
            // Tastatur erreichbar ist, trägt sie tabIndex und reagiert auf Enter/Leertaste.
            <tr
              key={schluessel(z, i)}
              className={onZeile ? "buchungszeile" : undefined}
              onClick={onZeile ? () => onZeile(z) : undefined}
              onKeyDown={onZeile ? tastatur(z) : undefined}
              tabIndex={onZeile ? 0 : undefined}
              role={onZeile ? "button" : undefined}
              title={onZeile ? zeilenTitel : undefined}
            >
              {spalten.map((s) => (
                <td
                  key={s.key}
                  style={{
                    ...ZELLE,
                    textAlign: s.align === "right" ? "right" : "left",
                    fontVariantNumeric: s.align === "right" ? "tabular-nums" : undefined,
                    color: s.gedimmt ? "var(--ink-3)" : ZELLE.color,
                    fontWeight: s.fett ? "var(--fw-bold)" : undefined,
                    width: s.breite,
                    whiteSpace: s.align === "right" || s.breite ? "nowrap" : undefined,
                    ...(s.kappen ? { maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
                  }}
                >
                  {s.render(z)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {fuss}
      {mehr && <div className="muted" style={{ padding: "6px 8px", fontSize: "var(--fs-2xs)" }}>{mehr}</div>}
    </Aufklappflaeche>
  );
}
