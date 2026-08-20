// Modal — dünner Wrapper um die Design-System-Dialog-Komponente. Die DS-Dialog nutzt
// position:absolute/inset:0; hier in einen fixierten Vollbild-Layer gehängt, damit das
// Modal über dem ganzen Fenster liegt. Esc + Klick auf den Scrim schließen.

import { useEffect, type ReactNode } from "react";
import { Dialog } from "./Dialog";

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // role/aria-modal am Layer: das DS-Dialog liefert nur das Aussehen. Ohne die Rolle
    // ist ein Modal für Screenreader ein beliebiger Kasten in der Seite — und für Tests
    // nicht als eigener Bereich adressierbar.
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: z }}>
      <Dialog title={title} subtitle={subtitle} onClose={onClose} footer={footer}>
        {children}
      </Dialog>
    </div>
  );
}
