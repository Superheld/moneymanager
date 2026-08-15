// CategoryPicker — Auswahl einer Kategorie über ein Such-Modal statt eines riesigen
// nativen Dropdowns. Button zeigt die aktuelle Wahl; Klick öffnet ein Modal mit
// Suchfeld (tippen filtert) und dem gruppierten Baum (Hauptgruppen → Unterkategorien).

import { useMemo, useState } from "react";
import type { Charakter, Kategorie } from "../../core";
import { Pill } from "./ds";
import { Modal } from "./Modal";

const CHARAKTER_PILL: Record<Charakter, "aufwand" | "ertrag" | "um"> = { Aufwand: "aufwand", Ertrag: "ertrag", Umschichtung: "um" };

export function CategoryPicker({
  kategorien,
  value,
  onChange,
  placeholder = "— wählen —",
}: {
  kategorien: Kategorie[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
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
      <button type="button" className="field" style={{ cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }} onClick={() => setOffen(true)}>
        <span style={{ color: gewaehlt ? "var(--ink)" : "var(--ink-3)" }}>{gewaehlt ? gewaehlt.name : placeholder}</span>
        <span style={{ color: "var(--ink-3)" }}>▾</span>
      </button>

      {offen && (
        <Modal title="Kategorie wählen" onClose={() => setOffen(false)} z={60}>
          <input className="field" autoFocus placeholder="suchen…" value={suche} onChange={(e) => setSuche(e.target.value)} />
          <div style={{ maxHeight: 360, overflow: "auto", marginTop: "var(--sp-2)" }}>
            <button type="button" className="katrow katmain pickrow" onClick={() => waehle("")} style={{ width: "100%" }}>
              <span className="nm" style={{ color: "var(--ink-3)" }}>— keine —</span>
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
