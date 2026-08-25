// CategoryPicker — Auswahl einer Kategorie über ein Such-Modal statt eines riesigen
// nativen Dropdowns. Button zeigt die aktuelle Wahl; Klick öffnet ein Modal mit
// Suchfeld (tippen filtert) und dem gruppierten Baum (Hauptgruppen → Unterkategorien).
//
// **Zwei Grössen, ein Modal.** `kompakt` ändert nur den KNOPF: im Formular ein Feld über
// die volle Breite, in einer Tabellenzeile ein kleines Etikett in der Grösse einer
// `Zeilenauswahl` daneben. Die Auswahl selbst bleibt dieselbe — ein Kategoriebaum ist
// auch in einer Tabellenzeile ein Kategoriebaum, und ihn dort als flache Klappliste
// nachzubauen hiesse, die Gruppierung und die Suche wegzuwerfen, an denen die native
// Liste gescheitert ist.
//
// **Getippt wird gesucht, mit den Pfeiltasten gewaehlt, mit Enter uebernommen.** Ohne das
// war die Suche eine halbe Sache: man tippte drei Buchstaben, hatte den Treffer vor sich
// und musste zur Maus greifen, um ihn anzuklicken — bei einer Liste, die man gerade
// deshalb durchsucht, weil sie zu lang zum Zeigen ist.
//
// Der Fokus bleibt dabei im SUCHFELD und wandert nicht mit — sonst koennte man nach dem
// ersten Pfeildruck nicht weitersuchen. Die Markierung ist deshalb nur eine Einfaerbung.
//
// **Die Zeilen bleiben gewoehnliche Knoepfe.** Aus ihnen eine `listbox` mit `option`-Zeilen
// zu machen waere die lehrbuchgetreue Form, und sie haette den Weg genommen, der heute
// schon da ist: Knoepfe stehen in der Tab-Reihenfolge, wer nicht mit der Maus arbeitet,
// kommt seit jeher per Tab und Enter durch die Liste. Die Pfeiltasten sind ein ZUSATZ fuer
// den, der ohnehin gerade tippt, kein Ersatz — und ein Zusatz darf den bestehenden Weg
// nicht abschneiden.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Charakter, Kategorie } from "../../../application";
import { Pill } from "./Pill";
import { Modal } from "./Modal";

const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = { Aufwand: "aufwand", Ertrag: "ertrag", Umschichtung: "um" };

export function CategoryPicker({
  kategorien,
  value,
  onChange,
  placeholder,
  kompakt,
  ariaLabel,
}: {
  kategorien: Kategorie[];
  value: string;
  onChange: (id: string) => void;
  /** Text, solange nichts gewählt ist. Ohne Angabe der übersetzte Standard. */
  placeholder?: string;
  /** Knopf in Zeilengrösse statt als Formularfeld — für eine Wahl IN einer Tabellenzeile. */
  kompakt?: boolean;
  /**
   * Der Name des Feldes. In einer Tabelle steht die Beschriftung in der Kopfzeile und
   * nicht am Knopf; ohne ihn meldet eine Vorlesehilfe nur den aktuellen Wert, und wozu
   * er gehört, bleibt offen. Im Formular trägt das `FormField` den Namen.
   */
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");

  const byId = useMemo(() => new Map(kategorien.map((k) => [k.id, k])), [kategorien]);
  const gewaehlt = value ? byId.get(value) : undefined;

  const ids = useMemo(() => new Set(kategorien.map((k) => k.id)), [kategorien]);
  const wurzeln = kategorien.filter((k) => !k.elternId || !ids.has(k.elternId));
  const kinderVon = (id: string) => kategorien.filter((k) => k.elternId === id);

  const q = suche.trim().toLowerCase();
  const passt = (k: Kategorie) => k.name.toLowerCase().includes(q);

  /**
   * Die sichtbaren Zeilen in der Reihenfolge, in der sie dastehen — flach.
   *
   * Der Baum ist zum Ansehen da, die Tastatur braucht eine Reihe: „eins weiter" heisst
   * genau das, was man sieht, quer über Gruppengrenzen hinweg. Zwei getrennte Ebenen zu
   * durchlaufen wäre für den Bedienenden dieselbe Bewegung mit zwei Regeln.
   */
  const sichtbar = useMemo(() => {
    // `treffer` unterscheidet die Zeile, die zur Suche PASST, von der, die nur dasteht,
    // weil eines ihrer Kinder passt. Ohne diesen Unterschied markierte „strom" die Gruppe
    // „Wohnen" — sichtbar, aber nicht gemeint.
    const raus: { id: string; treffer: boolean }[] = [{ id: "", treffer: false }];
    for (const w of wurzeln) {
      const kinder = kategorien.filter((k) => k.elternId === w.id);
      const kinderHit = kinder.filter(passt);
      if (q && !passt(w) && kinderHit.length === 0) continue;
      raus.push({ id: w.id, treffer: passt(w) });
      for (const c of q ? kinderHit : kinder) raus.push({ id: c.id, treffer: passt(c) });
    }
    return raus;
    // `passt` schliesst über `q`, `wurzeln` über `kategorien` — beide stehen unten drin.
  }, [kategorien, q]);

  /**
   * Wo die Markierung steht — `null` heisst „noch nicht selbst bewegt".
   *
   * Dieselbe Trennung wie bei der Richtungswahl im Buchungsdialog: solange niemand die
   * Pfeiltasten benutzt hat, ergibt sich die Markierung aus der Lage (erster Treffer der
   * Suche, sonst die erste Zeile). Sobald jemand sie bewegt hat, gilt seine Wahl.
   *
   * Ohne die Unterscheidung müsste jede Stelle, die `suche` ändert, den richtigen Index
   * schon kennen — und der steht erst fest, wenn die gefilterte Liste neu gerechnet ist.
   */
  const [markiert, setMarkiert] = useState<number | null>(null);
  const ersterTreffer = sichtbar.findIndex((e) => e.treffer);
  const vorgabe = q && ersterTreffer >= 0 ? ersterTreffer : 0;
  // Beim Tippen schrumpft die Liste; ein Index von vorhin zeigt dann ins Leere. Gekappt
  // wird beim Lesen, damit die Pfeiltasten nicht die neue Länge kennen müssen.
  const index = markiert === null ? vorgabe : Math.max(0, Math.min(markiert, sichtbar.length - 1));
  const markierteId = sichtbar[index]?.id;

  // Die markierte Zeile ins Bild holen. `nearest` scrollt nur, wenn sie wirklich draussen
  // ist — mit `center` spränge die Liste bei jedem Pfeildruck um eine halbe Höhe.
  const markierteZeile = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    markierteZeile.current?.scrollIntoView({ block: "nearest" });
  }, [markierteId]);

  function waehle(id: string) {
    onChange(id);
    setOffen(false);
    setSuche("");
    setMarkiert(null);
  }

  function beiTaste(e: React.KeyboardEvent) {
    switch (e.key) {
      // `preventDefault`, weil die Pfeiltasten in einem Textfeld sonst den Schreibzeiger
      // bewegen — die Liste stünde still und man sähe nicht, warum.
      case "ArrowDown": e.preventDefault(); setMarkiert(Math.min(index + 1, sichtbar.length - 1)); break;
      case "ArrowUp": e.preventDefault(); setMarkiert(Math.max(index - 1, 0)); break;
      case "Home": e.preventDefault(); setMarkiert(0); break;
      case "End": e.preventDefault(); setMarkiert(sichtbar.length - 1); break;
      case "Enter":
        e.preventDefault();
        if (markierteId !== undefined) waehle(markierteId);
        break;
      default:
        // Alles andere — auch Escape — geht weiter an den Dialog darum herum.
        break;
    }
  }

  return (
    <>
      {/* Der kompakte Knopf ist bewusst so gross wie eine `Zeilenauswahl` und trägt
          Rahmen, Zeiger und den Auswahlpfeil: eine Zelle, die nur Text zeigt, sieht aus
          wie eine Anzeige, und niemand klickt darauf. Was gewählt WERDEN kann, muss man
          ihm ansehen — dieselbe Überlegung wie bei `Zeilenauswahl`, dieselbe Grösse. */}
      <button
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        className={kompakt ? undefined : "field"}
        style={
          kompakt
            ? {
                font: "inherit",
                fontSize: "var(--fs-xs)",
                padding: "2px 8px",
                borderRadius: "var(--r-pill, 999px)",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                color: gewaehlt ? "var(--ink-2)" : "var(--ink-3)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                maxWidth: "100%",
              }
            : { cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }
        }
        onClick={() => { setOffen(true); setMarkiert(null); }}
      >
        <span style={kompakt ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : { color: gewaehlt ? "var(--ink)" : "var(--ink-3)" }}>
          {gewaehlt ? gewaehlt.name : placeholder ?? t("kategoriePicker.leer")}
        </span>
        <span aria-hidden="true" style={{ color: "var(--ink-3)", flex: "0 0 auto" }}>▾</span>
      </button>

      {offen && (
        <Modal title={t("kategoriePicker.titel")} onClose={() => setOffen(false)} z={60}>
          <input
            className="field"
            autoFocus
            placeholder={t("kategoriePicker.suche")}
            value={suche}
            onChange={(e) => {
              setSuche(e.target.value);
              // Zurück auf die Vorgabe: beim Suchen ist das der erste TREFFER, nicht
              // „keine Kategorie". Die steht als Zeile weiterhin oben — wer nichts tippt,
              // hat sie sofort; wer tippt, sucht etwas Bestimmtes und meint nicht das
              // Leeren.
              setMarkiert(null);
            }}
            onKeyDown={beiTaste}
          />
          <div style={{ maxHeight: 360, overflow: "auto", marginTop: "var(--sp-2)" }}>
            <Pickzeile id="" markiert={markierteId} klasse="katrow katmain pickrow" markiertRef={markierteZeile} onWaehlen={waehle}>
              <span className="nm" style={{ color: "var(--ink-3)" }}>{t("kategoriePicker.keine")}</span>
            </Pickzeile>
            {wurzeln.map((w) => {
              const kinder = kinderVon(w.id);
              const kinderHit = kinder.filter(passt);
              const wHit = passt(w);
              // Bei Suche nur zeigen, was passt (Gruppe sichtbar, wenn sie selbst oder ein Kind trifft).
              if (q && !wHit && kinderHit.length === 0) return null;
              const sichtbareKinder = q ? kinderHit : kinder;
              return (
                <div key={w.id} className="katgroup">
                  <Pickzeile id={w.id} markiert={markierteId} klasse="katrow katmain pickrow" markiertRef={markierteZeile} onWaehlen={waehle}>
                    <span className="nm">{w.name} <Pill variant={CHARAKTER_PILL[w.defaultCharakter]}>{w.defaultCharakter}</Pill></span>
                  </Pickzeile>
                  {sichtbareKinder.map((c) => (
                    <Pickzeile key={c.id} id={c.id} markiert={markierteId} klasse="katrow katchild pickrow" markiertRef={markierteZeile} onWaehlen={waehle}>
                      <span className="nm">{c.name} <Pill variant={CHARAKTER_PILL[c.defaultCharakter]}>{c.defaultCharakter}</Pill></span>
                    </Pickzeile>
                  ))}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Eine Zeile der Auswahlliste.
 *
 * Eigene Komponente, weil an jeder Zeile drei Dinge hängen, die zusammengehören und
 * nirgends auseinanderlaufen dürfen: die Markierung, der Klick und die Ref. Dreimal
 * ausgeschrieben wäre beim nächsten Anfassen an zwei von drei Stellen richtig.
 *
 * **Die Ref hängt nur an der MARKIERTEN Zeile.** Eine Ref an allen dreien liesse die letzte
 * gewinnen, und gescrollt würde ans Listenende statt zur Markierung.
 */
function Pickzeile({ id, markiert, klasse, markiertRef, onWaehlen, children }: {
  id: string;
  markiert?: string;
  klasse: string;
  markiertRef: React.RefObject<HTMLButtonElement | null>;
  onWaehlen: (id: string) => void;
  children: ReactNode;
}) {
  const istMarkiert = markiert === id;
  return (
    <button
      type="button"
      data-markiert={istMarkiert || undefined}
      ref={istMarkiert ? markiertRef : undefined}
      className={klasse}
      style={{ width: "100%" }}
      onClick={() => onWaehlen(id)}
    >
      {children}
    </button>
  );
}
