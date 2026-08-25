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

import { useMemo, useState } from "react";
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

  function waehle(id: string) {
    onChange(id);
    setOffen(false);
    setSuche("");
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
        onClick={() => setOffen(true)}
      >
        <span style={kompakt ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : { color: gewaehlt ? "var(--ink)" : "var(--ink-3)" }}>
          {gewaehlt ? gewaehlt.name : placeholder ?? t("kategoriePicker.leer")}
        </span>
        <span aria-hidden="true" style={{ color: "var(--ink-3)", flex: "0 0 auto" }}>▾</span>
      </button>

      {offen && (
        <Modal title={t("kategoriePicker.titel")} onClose={() => setOffen(false)} z={60}>
          <input className="field" autoFocus placeholder={t("kategoriePicker.suche")} value={suche} onChange={(e) => setSuche(e.target.value)} />
          <div style={{ maxHeight: 360, overflow: "auto", marginTop: "var(--sp-2)" }}>
            <button type="button" className="katrow katmain pickrow" onClick={() => waehle("")} style={{ width: "100%" }}>
              <span className="nm" style={{ color: "var(--ink-3)" }}>{t("kategoriePicker.keine")}</span>
            </button>
            {wurzeln.map((w) => {
              const kinder = kinderVon(w.id);
              const kinderHit = kinder.filter(passt);
              const wHit = passt(w);
              // Bei Suche nur zeigen, was passt (Gruppe sichtbar, wenn sie selbst oder ein Kind trifft).
              if (q && !wHit && kinderHit.length === 0) return null;
              const sichtbareKinder = q ? kinderHit : kinder;
              return (
                <div key={w.id} className="katgroup">
                  <button type="button" className="katrow katmain pickrow" onClick={() => waehle(w.id)} style={{ width: "100%" }}>
                    <span className="nm">{w.name} <Pill variant={CHARAKTER_PILL[w.defaultCharakter]}>{w.defaultCharakter}</Pill></span>
                  </button>
                  {sichtbareKinder.map((c) => (
                    <button type="button" key={c.id} className="katrow katchild pickrow" onClick={() => waehle(c.id)} style={{ width: "100%" }}>
                      <span className="nm">{c.name} <Pill variant={CHARAKTER_PILL[c.defaultCharakter]}>{c.defaultCharakter}</Pill></span>
                    </button>
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
