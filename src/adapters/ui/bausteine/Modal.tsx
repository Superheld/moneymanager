// Modal — der Dialog der App. Mechanik von Base UI `Dialog`, Aussehen in `app.css`
// (`.dialog-*`). Wer ihn rendert, hat ihn offen; geschlossen wird er, indem der Aufrufer
// ihn nicht mehr rendert (`onClose`).
//
// **Warum Base UI darunter (seit 2026-11-10).** Der Eigenbau davor hatte Escape, Klick auf
// den Hintergrund und ein Portal — und sonst nichts von dem, was einen Dialog für die
// Tastatur benutzbar macht: der Fokus blieb beim Öffnen draussen stehen, die Tabulatortaste
// lief hinter den Dialog in die Seite, und beim Schliessen landete der Fokus auf `<body>`.
// Base UI bringt Fokusfalle, Fokusrückgabe, Seitensperre, Escape und die Beschriftung über
// den Titel mit. Was hier bleibt, sind die Entscheidungen.
//
// **Der Layer hängt an `document.body`, nicht dort, wo er im Baum steht.** Ein Modal wird
// an der Stelle gerendert, an der es aufgeht — im Zweifel in einer Tabellenzelle. Steht
// über ihm irgendwo eine `opacity` (die Konten-Tabelle dämpft damit zukünftige Zeilen),
// erbt ein `position: fixed`-Kind sie: der Dialog erscheint durchscheinend, liegt im
// Stapel der Zeile statt über der Seite, und der Scrim deckt nur die Tabelle ab. Das
// Portal von Base UI nimmt ihn heraus, wie vorher das eigene.
//
// **Escape schliesst nur den OBERSTEN Dialog.** Der Eigenbau führte dafür einen Stapel
// offener Nummern, vergeben beim ersten Render (React rendert von aussen nach innen, die
// Effekte laufen umgekehrt — ein Stapel aus Effekten stand auf dem Kopf). Base UI kennt
// verschachtelte Dialoge selbst, wenn der innere IM äusseren gerendert wird, und gibt die
// Taste nur dem obersten. `Modal.test.tsx` hält beides fest, an einem verschachtelten
// Aufbau, weil ein einzelner Dialog sich in jedem Fall richtig verhält.

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Was als erstes Ziel für die Tastatur taugt — im INHALT, nicht im Kopf. */
const FOKUSZIEL =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]):not([aria-disabled="true"]), [href], [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  subtitle,
  onClose,
  footer,
  children,
  z = 50,
  warnung = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  /**
   * z-Index der Ebene. Verschachtelte Dialoge brauchen ihn nicht mehr zwingend — der
   * innere hängt später im Dokument und liegt damit oben —, er bleibt für die Stellen,
   * die ihn ausdrücklich setzen.
   */
  z?: number;
  /**
   * Eine Rückfrage vor etwas, das nicht zurückgeht (`Loeschfrage`). Base UI `AlertDialog`
   * statt `Dialog`: die Vorlesehilfe meldet eine Warnung (`alertdialog`), und ein Klick
   * NEBEN den Kasten schliesst ihn nicht — ein Fehlklick soll die Frage nicht still
   * verwerfen, sondern sie stehen lassen. Escape und der Schliessknopf gehen weiter.
   */
  warnung?: boolean;
}) {
  const { t } = useTranslation();
  const popup = useRef<HTMLDivElement>(null);
  const inhalt = useRef<HTMLDivElement>(null);

  // Wohin der Fokus beim Öffnen geht. Base UI nimmt ohne Angabe das erste fokussierbare
  // Element im Dialog — und das ist bei uns der Schliessknopf im Kopf. Wer einen Dialog
  // öffnet, um etwas einzutragen, landete damit auf „schliessen".
  //
  // Deshalb: hat ein Feld sich per `autoFocus` schon selbst genommen (React fokussiert beim
  // Einhängen, also vor diesem Aufruf), bleibt es dabei. Sonst das erste Ziel im Inhalt,
  // und erst wenn dort keins ist, der Standard.
  const ersterFokus = () => {
    const aktiv = document.activeElement;
    if (aktiv instanceof HTMLElement && popup.current?.contains(aktiv)) return aktiv;
    return inhalt.current?.querySelector<HTMLElement>(FOKUSZIEL) ?? true;
  };

  // Base UI meldet jede Art des Schliessens hierher: Escape, Klick daneben, der
  // Schliessknopf. Geöffnet wird nie von innen — der Aufrufer rendert uns.
  const offenGeaendert = (offen: boolean) => {
    if (!offen) onClose();
  };

  // Die beiden Wurzeln unterscheiden sich nur im Verhalten; alle Teile darunter sind bei
  // Base UI dieselben (`AlertDialog.Popup` IST `Dialog.Popup`).
  const ebene = (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="dialog-scrim" style={{ zIndex: z }} />
      <BaseDialog.Viewport className="dialog-viewport" style={{ zIndex: z }}>
        <BaseDialog.Popup ref={popup} className="dialog-kasten" initialFocus={ersterFokus}>
          <div className="dialog-kopf">
            <div className="dialog-titelblock">
              <BaseDialog.Title className="dialog-titel">{title}</BaseDialog.Title>
              {subtitle && (
                <BaseDialog.Description className="dialog-untertitel" render={<div />}>
                  {subtitle}
                </BaseDialog.Description>
              )}
            </div>
            {/* Der Name kommt aus i18n: „✕" allein liest eine Vorlesehilfe als
                „Multiplikationszeichen". */}
            <BaseDialog.Close className="dialog-schliessen" aria-label={t("shell.dialogSchliessen")}>
              ✕
            </BaseDialog.Close>
          </div>
          {/* Der einzige Teil, der schmal scrollt (siehe `.dialog-inhalt` in app.css). */}
          <div ref={inhalt} className="dialog-inhalt">
            {children}
          </div>
          {footer && <div className="dialog-fuss">{footer}</div>}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );

  return warnung ? (
    <AlertDialog.Root open onOpenChange={offenGeaendert}>{ebene}</AlertDialog.Root>
  ) : (
    <BaseDialog.Root open onOpenChange={offenGeaendert}>{ebene}</BaseDialog.Root>
  );
}
