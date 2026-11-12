// DataTable — die Haarlinien-Tabelle der App (Verträge, Konten, Analysen, Stammdaten).
// `columns` legen Schlüssel, Kopf, Ausrichtung und optional einen Zell-Renderer fest;
// rechtsbündige Zahlenspalten bekommen Tabellenziffern von selbst.
//
// Seit 2026-11-10 TypeScript statt `.jsx` mit handgeschriebener `.d.ts` — vorher prüfte
// der Compiler das Innere nicht, und die `.d.ts` konnte vom Code weglaufen, ohne dass
// etwas rot wurde. Bei der meistbenutzten Komponente der App.
//
// **Sortierung** (opt-in via `sortable`): Klick auf einen Spaltenkopf sortiert auf → ab →
// Originalreihenfolge. Sortierwert ist `column.sortValue(row)` oder sonst `row[column.key]`
// (Zahlen numerisch, sonst locale-/numerisch-tolerant). Einzelne Spalten lassen sich mit
// `column.sortable === false` ausnehmen.
//
// **Zeilenhöhe:** Zellen brechen NICHT um. Eine zweizeilige Zeile verschiebt alles darunter
// — bei paginierten Tabellen wandert dadurch der Seitenschalter je nach Inhalt der
// aktuellen Seite nach oben oder unten, und man klickt daneben.
//
// **Breite:** Nicht-Umbrechen allein sprengt die Tabelle, sobald ein Wert lang ist (ein
// langer Firmenname schiebt sie über den Bildschirmrand). Deshalb sitzt der Inhalt jeder
// Zelle in einem Block mit `max-width` und wird dort abgeschnitten; der volle Text steht
// im `title`.
//
// WARUM ein innerer Block und nicht `max-width` an der Zelle selbst: die Wirkung von
// min-/max-width auf Tabellenzellen ist in CSS 2.1 ausdrücklich UNDEFINIERT und wird bei
// `table-layout: auto` von Browsern ignoriert. Genau das war der Fehler — `column.maxWidth`
// stand an den Konten-Spalten und tat nichts. In einem gewöhnlichen Block gilt max-width
// dagegen sicher, und die begrenzte Breite geht in die Spaltenberechnung ein.
//
// Als Fangnetz liegt die Tabelle in einem waagerecht scrollbaren Rahmen: passt sie in einem
// schmalen Fenster trotzdem nicht, scrollt SIE — statt die ganze Seite breitzuziehen.
//
// **Klickbare Zeilen sind mit der Tastatur erreichbar** (seit 2026-11-10). Vorher hing der
// Klick an `<tr onClick>` ohne Fokus und ohne Tasten: wo keine `Zeilenlink`-Zelle in der
// Zeile stand, kam man ohne Maus nicht hinein. Jetzt trägt die Zeile `tabIndex`, Enter und
// Leertaste lösen den Klick aus. Sie BLEIBT dabei eine Tabellenzeile (kein
// `role="button"`): eine Vorlesehilfe liest sie weiter Zelle für Zelle und kann in der
// Tabelle spaltenweise navigieren — ein Knopf fasste die ganze Zeile zu einem Namen
// zusammen. `aria-current` sagt, welche Zeile gerade aufgeklappt ist (`istAktiv`) — `aria-selected`
// wäre der naheliegende Name und gilt nur in einem `grid`, nicht in einer Tabelle.
//
// ## Schmal: dieselbe Tabelle mit zwei Spalten
//
// Auf einem Telefon war der Rahmen bisher die ganze Antwort — man sah die ersten Spalten
// und musste seitwärts schieben, um an den Betrag zu kommen, also an das, wofür man
// hingesehen hat. Unter 700 px (`useSchmal`) fällt die Tabelle deshalb auf ZWEI Spalten
// zusammen: links der Bezeichner, darunter gedämpft die verschobenen Werte, rechts die
// eine Zahl. Das ist die eine Stelle, an der `useSchmal` gebraucht wird: das MARKUP
// ändert sich, und Zellen zusammenlegen kann CSS nicht.
//
// **Es bleibt eine Tabelle, keine Kartenliste.** Die Zahl steht in jeder Zeile an
// derselben Stelle, und damit bleibt das Einzige erhalten, wofür eine Tabelle da ist: man
// liest eine Spalte hinunter, ohne sie zu suchen. Aus demselben Grund bleiben die beiden
// Spaltenköpfe stehen — mit ihnen bliebe sonst auch die Sortierung.
//
// **Die Vorgabe verschiebt, sie streicht nicht.** Ohne Angabe wird die erste Spalte zum
// Titel, die erste rechtsbündige zum Wert, und ALLES ÜBRIGE wandert in die zweite Zeile.
// Das ist unaufgeräumt und mit Absicht: eine Spalte still fallen zu lassen, wäre in einer
// Finanz-App eine gekürzte Auskunft, die niemand entschieden hat. Weggeräumt wird je
// Tabelle von Hand, über `column.schmal` — ist das an EINER Spalte gesetzt, gilt nur noch,
// was ausdrücklich dasteht, und der Rest fällt weg.

import { NumberField } from "@base-ui/react/number-field";
import { Fragment, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { useSchmal } from "./useSchmal";

export interface DataColumn<T = unknown> {
  key: string;
  label: ReactNode;
  align?: "left" | "right";
  /** Eigener Zell-Renderer; ohne ihn steht `row[key]` da. */
  render?: (row: T) => ReactNode;
  /** Bei aktivierter Tabellen-Sortierung: Sortierwert (sonst row[key]). */
  sortValue?: (row: T) => string | number;
  /** Diese Spalte von der Sortierung ausnehmen. */
  sortable?: boolean;
  /** Begrenzt die Spaltenbreite; längerer Inhalt wird abgeschnitten statt umzubrechen. */
  maxWidth?: number | string;
  /**
   * Die Rolle dieser Spalte in der SCHMALEN Form (unter 700 px, siehe `useSchmal`):
   * `titel` erste Zeile links, `wert` die Zahl rechts, `zweitzeile` gedämpft darunter.
   *
   * **Sobald EINE Spalte der Tabelle das setzt, gilt nur noch das Gesetzte** — jede
   * Spalte ohne Angabe fällt dann schmal weg. Das ist die Stelle, an der aufgeräumt
   * wird. Sagt keine Spalte etwas, verschiebt die Vorgabe stattdessen alles
   * (erste Spalte = Titel, erste rechtsbündige = Wert, Rest in die zweite Zeile) und
   * wirft nichts weg.
   */
  schmal?: "titel" | "wert" | "zweitzeile";
  /**
   * Diese Spalte trägt den Bezeichner einer klickbaren Zeile (den Link-Stil) — statt der
   * ersten. Für Tabellen, deren erste Spalte kein Name ist: im Kontoauszug steht vorn das
   * Datum, und ein unterstrichenes Datum sagt nicht, WAS sich öffnet.
   */
  bezeichner?: boolean;
}

export interface DataTableProps<T> {
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  /** Macht Zeilen anklickbar — und mit der Tastatur erreichbar (Tab, Enter, Leertaste). */
  onRowClick?: (row: T) => void;
  /** Markiert die aktive Zeile (Hervorhebung, `aria-current`). */
  istAktiv?: (row: T) => boolean;
  /**
   * Stil je Zeile, zuletzt aufgetragen. Gedacht für `opacity` — das dämpft den ganzen
   * Teilbaum inklusive der Zellen, die ihre Farbe selbst setzen. Über `color` ginge das
   * nicht, die Zellen überschreiben es.
   */
  rowStyle?: (row: T) => CSSProperties | undefined;
  /** Spaltenkopf-Klick sortiert (auf → ab → original). Pro Spalte via sortable abschaltbar. */
  sortable?: boolean;
  /** Wenn gesetzt, paginiert die Tabelle mit dieser Seitengröße (Steuerung unten). */
  pageSize?: number;
  /**
   * Beschriftungen der Seitensteuerung. Optional, damit die Komponente selbst sprachfrei
   * bleibt — die App reicht übersetzte Texte durch.
   */
  labelSeite?: string;
  labelErste?: string;
  labelLetzte?: string;
  labelZurueck?: string;
  labelVor?: string;
}

/**
 * Der Bezeichner einer klickbaren Zeile — die erste Spalte, schmal die Titelzeile — steht
 * als Link da (seit 2026-11-11, `.datentabelle-bezeichner` in `app.css`).
 *
 * Das EINE Muster für jede Tabelle: ist die Zeile klickbar, ist es die GANZE Zeile, und
 * ihr Name zeigt es an. Ist sie es nicht, ist alles Text. Vorher stand das an drei Stellen
 * dreimal anders da: Konten mit einem Link im Namen und einer toten Zeile daneben, der
 * Kontoauszug mit einer klickbaren Zeile ohne jedes Zeichen dafür, die Verträge mit dem
 * Weg in einer einzigen Spalte. Gesetzt wird es hier, damit es keine Tabelle vergisst.
 */
const BEZEICHNER = "datentabelle-bezeichner";

/** Was in einer klickbaren Zeile selbst bedient wird und deren Klick nicht auslöst. */
const BEDIENTEIL = "button, a, input, select, textarea, label, [role=button], [role=checkbox], [role=combobox], [role=switch]";

/** Kappungsbreite, wenn eine Spalte keine eigene angibt. Zahlen/Daten bleiben darunter. */
const STANDARD_MAX = "32ch";

/**
 * Breite der Wertspalte in der schmalen Form.
 *
 * Sie muss FEST sein: schmal liegt `table-layout: fixed` an, sonst zieht ein langer Name
 * die Tabelle wieder aus dem Bild — genau das Übel, gegen das die schmale Form gebaut ist.
 * 12ch fasst einen Betrag samt Minus, Tausenderpunkt und Währungszeichen.
 */
const SCHMAL_WERT_BREITE = "12ch";

interface MitIndex<T> {
  c: DataColumn<T>;
  i: number;
}

/**
 * Welche Spalten schmal überleben, und in welcher Rolle — samt ihrem ursprünglichen
 * Index, damit die Sortierung weiter auf dieselbe Spalte zeigt.
 */
function schmalRollen<T>(columns: readonly DataColumn<T>[]) {
  const mitIndex: MitIndex<T>[] = columns.map((c, i) => ({ c, i }));
  const gewaehlt = mitIndex.some((e) => !!e.c.schmal);

  if (gewaehlt) {
    return {
      titel: mitIndex.find((e) => e.c.schmal === "titel") ?? mitIndex[0],
      wert: mitIndex.find((e) => e.c.schmal === "wert") ?? null,
      zweit: mitIndex.filter((e) => e.c.schmal === "zweitzeile"),
    };
  }

  const titel = mitIndex[0];
  const wert = mitIndex.slice(1).find((e) => e.c.align === "right") ?? null;
  return { titel, wert, zweit: mitIndex.filter((e) => e !== titel && e !== wert) };
}

/** Der rohe Wert einer Spalte — für Spalten ohne `render`. */
function roh<T>(c: DataColumn<T>, row: T): unknown {
  return (row as Record<string, unknown>)[c.key];
}

/** Der Zellwert einer Spalte — über `render`, sonst roh aus der Zeile. */
function zellwert<T>(c: DataColumn<T>, row: T): ReactNode {
  return c.render ? c.render(row) : (roh(c, row) as ReactNode);
}

/** Nur echter Text taugt als Tooltip; ein gerendertes Element hat keinen. */
function alsText(v: unknown): string | undefined {
  return typeof v === "string" || typeof v === "number" ? String(v) : undefined;
}

function vergleichen(va: unknown, vb: unknown): number {
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  istAktiv,
  rowStyle,
  sortable = false,
  pageSize,
  labelSeite,
  labelErste,
  labelLetzte,
  labelZurueck,
  labelVor,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ idx: number; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const schmal = useSchmal();

  const kannSortieren = (c: DataColumn<T>) => sortable && c.sortable !== false;
  const toggleSort = (ci: number, c: DataColumn<T>) => {
    if (!kannSortieren(c)) return;
    setPage(0);
    setSort((prev) => {
      if (!prev || prev.idx !== ci) return { idx: ci, dir: "asc" };
      if (prev.dir === "asc") return { idx: ci, dir: "desc" };
      return null; // dritter Klick: zurück zur Originalreihenfolge
    });
  };

  let sortedRows = rows;
  if (sort) {
    const sc = columns[sort.idx];
    const wert = sc.sortValue ?? ((r: T) => roh(sc, r));
    sortedRows = rows.slice().sort((a, b) => {
      const cmp = vergleichen(wert(a), wert(b));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }

  const gesamt = sortedRows.length;
  const seiten = pageSize ? Math.max(1, Math.ceil(gesamt / pageSize)) : 1;
  const seite = Math.min(page, seiten - 1);
  const sichtbareRows = pageSize ? sortedRows.slice(seite * pageSize, (seite + 1) * pageSize) : sortedRows;

  const rollen = schmal ? schmalRollen(columns) : null;
  // Ohne Angabe ist es die erste Spalte — so stand es vorher fest im Code.
  const bezeichnerSpalte = Math.max(0, columns.findIndex((c) => c.bezeichner));
  // Die Kopfzeile zeigt schmal genau die beiden Spalten, die es noch gibt — mit ihrem
  // ursprünglichen Index, damit ein Klick weiterhin nach derselben Spalte sortiert.
  const kopf: MitIndex<T>[] = rollen
    ? [rollen.titel, rollen.wert].filter((e): e is MitIndex<T> => !!e)
    : columns.map((c, i) => ({ c, i }));

  function zelleZweitzeile(row: T) {
    if (!rollen) return null;
    const teile: ReactNode[] = [];
    const texte: string[] = [];
    rollen.zweit.forEach((e, n) => {
      const v = zellwert(e.c, row);
      if (v === null || v === undefined || v === "") return;
      if (teile.length) teile.push(<span key={"t" + n} style={{ opacity: 0.45 }}> · </span>);
      teile.push(<Fragment key={"v" + n}>{v}</Fragment>);
      const s = alsText(v);
      if (s) texte.push(s);
    });
    if (!teile.length) return null;
    return (
      <div
        title={texte.length ? texte.join(" · ") : undefined}
        style={{ marginTop: 2, fontSize: "var(--fs-xs)", fontWeight: "var(--fw-regular)", color: "var(--ink-3)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {teile}
      </div>
    );
  }

  /** Was eine klickbare Zeile braucht: Fokus, Klick, Enter und Leertaste. */
  function zeilenBedienung(row: T) {
    if (!onRowClick) return {};
    return {
      tabIndex: 0,
      className: "datentabelle-zeile--klickbar",
      onClick: (e: MouseEvent<HTMLTableRowElement>) => {
        // Ein Klick auf ein Bedienteil IN der Zeile (Bearbeiten, Löschen, eine Auswahl)
        // gehört diesem, nicht der Zeile — dieselbe Regel wie bei den Tasten unten. Ohne
        // sie öffnete „Löschen" nebenbei auch, was die Zeile öffnet.
        const ziel = (e.target as Element).closest(BEDIENTEIL);
        if (ziel && ziel !== e.currentTarget && e.currentTarget.contains(ziel)) return;
        onRowClick(row);
      },
      onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
        // Nur wenn die ZEILE den Fokus hat: eine Taste in einem Feld oder Knopf darin
        // gehört diesem, nicht der Zeile.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRowClick(row);
        }
      },
    };
  }

  return (
    <>
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-tabelle)", tableLayout: schmal ? "fixed" : "auto" }}>
          <thead>
            <tr>
              {kopf.map(({ c, i }) => {
                const sortbar = kannSortieren(c);
                const aktiv = sort?.idx === i;
                const pfeil = aktiv ? (sort!.dir === "asc" ? " ▲" : " ▼") : sortbar ? " ⇅" : "";
                const rechts = c.align === "right";
                return (
                  <th
                    key={i}
                    onClick={sortbar ? () => toggleSort(i, c) : undefined}
                    aria-sort={aktiv ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    style={{ textAlign: rechts ? "right" : "left", fontSize: "var(--fs-2xs)",
                      fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em",
                      color: aktiv ? "var(--ink-2)" : "var(--ink-3)", padding: "8px 10px",
                      borderBottom: "1px solid var(--line)", cursor: sortbar ? "pointer" : "default",
                      userSelect: "none", whiteSpace: "nowrap",
                      width: schmal && rechts ? SCHMAL_WERT_BREITE : undefined,
                      overflow: schmal ? "hidden" : undefined, textOverflow: schmal ? "ellipsis" : undefined }}
                  >
                    {c.label}
                    <span style={{ opacity: aktiv ? 0.9 : 0.35 }}>{pfeil}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sichtbareRows.map((row, ri) => {
              const zeileAktiv = istAktiv ? istAktiv(row) : false;
              // `rowStyle` liegt ZULETZT drauf, damit eine Zeile sich auch gegen die
              // Vorgaben stellen kann (siehe Prop).
              const zeilenStil: CSSProperties = {
                cursor: onRowClick ? "pointer" : "default",
                background: zeileAktiv ? "var(--accent-soft)" : "transparent",
                ...(rowStyle ? rowStyle(row) : undefined),
              };
              const bedienung = zeilenBedienung(row);
              const ausgewaehlt = onRowClick && zeileAktiv ? true : undefined;

              if (rollen) {
                const tv = zellwert(rollen.titel.c, row);
                const wv = rollen.wert ? zellwert(rollen.wert.c, row) : null;
                return (
                  <tr key={ri} {...bedienung} aria-current={ausgewaehlt} style={zeilenStil}>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)", textAlign: "left", color: "var(--ink)", overflow: "hidden" }}>
                      <div title={alsText(tv)} className={onRowClick ? BEZEICHNER : undefined} style={{ fontWeight: "var(--fw-bold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tv}</div>
                      {zelleZweitzeile(row)}
                    </td>
                    {rollen.wert && (
                      <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)", textAlign: "right",
                        fontVariantNumeric: "tabular-nums", color: "var(--ink)", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "top" }}>{wv}</td>
                    )}
                  </tr>
                );
              }

              return (
                <tr key={ri} {...bedienung} aria-current={ausgewaehlt} style={zeilenStil}>
                  {columns.map((c, ci) => {
                    const istBezeichner = onRowClick && ci === bezeichnerSpalte;
                    const v = zellwert(c, row);
                    const rechts = c.align === "right";
                    return (
                      <td key={ci} style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)",
                        textAlign: rechts ? "right" : "left", fontVariantNumeric: rechts ? "tabular-nums" : "normal",
                        fontWeight: ci === 0 ? "var(--fw-bold)" : "var(--fw-regular)", color: "var(--ink)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {/* marginLeft:auto hält rechtsbündige Spalten am rechten Zellenrand:
                            die Tabelle verteilt übrige Breite auf die Spalten, und ein
                            gekappter Block stünde sonst links davon — Zahl und Spaltenkopf
                            lägen nicht übereinander. */}
                        <div title={alsText(v)} className={istBezeichner ? BEZEICHNER : undefined} style={{ maxWidth: c.maxWidth ?? STANDARD_MAX,
                          marginLeft: rechts ? "auto" : undefined,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageSize && seiten > 1 && (
        <div className="datentabelle-seiten">
          <Button groesse="klein" disabled={seite === 0} onClick={() => setPage(0)} title={labelErste} aria-label={labelErste}>|‹</Button>
          <Button groesse="klein" disabled={seite === 0} onClick={() => setPage(seite - 1)} title={labelZurueck} aria-label={labelZurueck}>‹</Button>
          {/* Freie Seitenwahl: bei tausenden Zeilen ist „ans Ende blättern" sonst
              Klickarbeit. Base UI `NumberField`: es nimmt nur Zahlen, hält die Grenzen
              und lässt sich mit den Pfeiltasten stufen. */}
          <NumberField.Root
            value={seite + 1}
            min={1}
            max={seiten}
            onValueChange={(n) => {
              if (n !== null && !Number.isNaN(n)) setPage(Math.min(Math.max(Math.round(n), 1), seiten) - 1);
            }}
          >
            <NumberField.Input aria-label={labelSeite} className="datentabelle-seitenfeld" />
          </NumberField.Root>
          <span style={{ whiteSpace: "nowrap" }}>
            / {seiten} · {seite * pageSize + 1}–{Math.min(gesamt, (seite + 1) * pageSize)} / {gesamt}
          </span>
          <Button groesse="klein" disabled={seite >= seiten - 1} onClick={() => setPage(seite + 1)} title={labelVor} aria-label={labelVor}>›</Button>
          <Button groesse="klein" disabled={seite >= seiten - 1} onClick={() => setPage(seiten - 1)} title={labelLetzte} aria-label={labelLetzte}>›|</Button>
        </div>
      )}
    </>
  );
}
