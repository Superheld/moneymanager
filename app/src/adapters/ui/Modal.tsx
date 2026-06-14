// Modal — dünner Wrapper um die Design-System-Dialog-Komponente. Die DS-Dialog nutzt
// position:absolute/inset:0; hier in einen fixierten Vollbild-Layer gehängt, damit das
// Modal über dem ganzen Fenster liegt. Esc + Klick auf den Scrim schließen.

import { useEffect, type ReactNode } from "react";
import { Dialog } from "./ds";

export function Modal({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <Dialog title={title} subtitle={subtitle} onClose={onClose} footer={footer}>
        {children}
      </Dialog>
    </div>
  );
}
