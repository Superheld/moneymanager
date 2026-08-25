// Modal — dünner Wrapper um die Design-System-Dialog-Komponente. Die DS-Dialog nutzt
// position:absolute/inset:0; hier in einen fixierten Vollbild-Layer gehängt, damit das
// Modal über dem ganzen Fenster liegt. Esc + Klick auf den Scrim schließen.
//
// **Der Layer hängt an `document.body`, nicht dort, wo er im Baum steht.** Ein Modal wird
// an der Stelle gerendert, an der es aufgeht — im Zweifel in einer Tabellenzelle. Steht
// über ihm irgendwo eine `opacity` (die Konten-Tabelle dämpft damit zukünftige Zeilen),
// dann erbt ein `position: fixed`-Kind sie: der Dialog erscheint durchscheinend, liegt im
// Stapel der Zeile statt über der Seite, und der Scrim deckt nur die Tabelle ab. Ein
// Portal nimmt ihn aus dem Baum heraus, und keine dieser drei Wirkungen erreicht ihn mehr.
//
// **Esc schliesst nur den OBERSTEN Dialog.** Jeder Modal-Layer hörte vorher selbst am
// Fenster mit; bei zwei offenen Dialogen schlossen beide auf einen Tastendruck — der
// auslösende gleich mit. Der Stapel unten hält die Reihenfolge, und nur der letzte
// Eintrag reagiert.

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "./Dialog";

/**
 * Wer gerade offen ist — als Nummern, nicht als Reihenfolge.
 *
 * Die Nummer wird beim ersten RENDER vergeben und nicht im Effekt. Das ist der ganze
 * Trick: React rendert von aussen nach innen, führt die Effekte aber von innen nach
 * aussen aus. Ein Stapel, in den sich jeder Dialog im Effekt einträgt, steht deshalb auf
 * dem Kopf — der äussere landet obenauf und schluckt die Escape, die dem inneren galt.
 * Gemessen, nicht vermutet: genau daran ist die erste Fassung gescheitert.
 *
 * Die höchste Nummer ist der oberste Dialog. Nur er reagiert.
 */
let naechsteNummer = 0;
const offeneDialoge = new Set<number>();

export function Modal({
  title,
  subtitle,
  onClose,
  footer,
  children,
  z = 50,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  /** z-Index des Overlays; höher für verschachtelte Modale (z. B. Picker). */
  z?: number;
}) {
  // Der Schliesser wandert über eine Ref in den Effekt, damit der nur beim Mounten und
  // Verlassen läuft. Mit `onClose` in der Abhängigkeitsliste liefe er bei jedem Render
  // neu — die Aufrufer geben durchweg Pfeilfunktionen herein, die jedes Mal neu sind —,
  // und der Stapel verlöre bei jedem Tastendruck seine Reihenfolge.
  const schliessen = useRef(onClose);
  schliessen.current = onClose;

  // Die eigene Nummer, einmal beim ersten Render vergeben. Sie steht in einer Ref und
  // nicht in `useState`, weil sie nichts neu zeichnet — sie ist nur eine Identität.
  const nummerRef = useRef<number | null>(null);
  if (nummerRef.current === null) nummerRef.current = ++naechsteNummer;
  const nummer = nummerRef.current;

  useEffect(() => {
    offeneDialoge.add(nummer);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Hat schon jemand anders reagiert (ein offenes Auswahlfeld, ein Kalender), ist
      // die Taste verbraucht — sonst schlösse dieselbe Escape zwei Ebenen auf einmal.
      if (e.defaultPrevented) return;
      if (Math.max(...offeneDialoge) !== nummer) return;
      schliessen.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      offeneDialoge.delete(nummer);
    };
  }, [nummer]);

  return createPortal(
    // role/aria-modal am Layer: das DS-Dialog liefert nur das Aussehen. Ohne die Rolle
    // ist ein Modal für Screenreader ein beliebiger Kasten in der Seite — und für Tests
    // nicht als eigener Bereich adressierbar.
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: z }}>
      <Dialog title={title} subtitle={subtitle} onClose={onClose} footer={footer}>
        {children}
      </Dialog>
    </div>,
    document.body,
  );
}
