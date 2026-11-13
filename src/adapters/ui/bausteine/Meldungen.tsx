// Meldungen — was zu sehen ist, wenn etwas ausserhalb des Zeichnens schiefgeht.
// Mechanik von Base UI `Toast`, Aussehen in `app.css` (`.meldung`).
//
// **Die Lücke, die das schliesst.** Die `Fehlergrenze` fängt nur Fehler beim RENDERN.
// Ein abgelehntes `await` in einem Klick oder in einem Ladeeffekt lief an ihr vorbei —
// und an mehreren Stellen wurde es ausdrücklich geschluckt (`.catch(() => setX([]))`),
// mit dem Kommentar „reiner Browser-Modus ohne SQLite". Den Modus gibt es nicht mehr: die
// Browser-Vorschau bringt eine Attrappe der Tauri-Naht mit. Was dort scheitert, ist ein
// echter Fehler — und er endete als leere Liste, die aussah wie „du hast keine".
//
// **Zwei Wege hinein:**
// - `fehlerMelden(e)` an einer Stelle, die einen Rückfall hat (leere Liste statt
//   Absturz) und den Fehler trotzdem nicht verschweigen soll.
// - Der Lauscher auf `unhandledrejection`: alles, was NIEMAND fängt. Er ist das Netz,
//   nicht der Weg — eine Stelle, die ihren Fehler selbst am Ort anzeigen kann
//   (`fehlerNachricht` neben dem Knopf), tut das weiterhin; dort weiss man, worum es ging.
//
// **Warum Base UI.** Eine Meldung, die von selbst erscheint, muss eine Vorlesehilfe
// ansagen (`aria-live`), darf den Fokus nicht stehlen, muss sich mit der Tastatur
// schliessen lassen und darf beim Hovern nicht verschwinden. Das ist dieselbe Hälfte, die
// beim Eigenbau fehlt.
//
// Der Verwalter steht ausserhalb von React (`createToastManager`), damit `fehlerMelden`
// auch aus einem `.catch` heraus geht, das keinen Hook aufrufen kann.

import { Toast } from "@base-ui/react/toast";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n/i18n";
import { fehlerNachricht } from "./einstellungenKontext";

const verwalter = Toast.createToastManager();

/** Wie lange eine Fehlermeldung steht: lang genug zum Lesen, sie verschwindet aber. */
const STEHZEIT_MS = 8000;

/** Einen Fehler melden, der sonst nirgends zu sehen wäre. */
export function fehlerMelden(e: unknown): void {
  verwalter.add({
    title: i18n.t("meldung.fehlerTitel"),
    description: fehlerNachricht(i18n.t.bind(i18n), e),
    type: "fehler",
    priority: "high",
    timeout: STEHZEIT_MS,
  });
}

function Liste() {
  const { toasts } = Toast.useToastManager();
  const { t } = useTranslation();
  return (
    <Toast.Portal>
      <Toast.Viewport className="meldungen" aria-label={t("meldung.bereich")}>
        {toasts.map((m) => (
          <Toast.Root key={m.id} toast={m} className="meldung" data-art={m.type}>
            <Toast.Content className="meldung-inhalt">
              <Toast.Title className="meldung-titel" />
              <Toast.Description className="meldung-text" />
            </Toast.Content>
            <Toast.Close className="meldung-zu" aria-label={t("meldung.schliessen")}>
              ✕
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

/**
 * Um die App legen. Hängt den Lauscher für unbehandelte Ablehnungen ein und zeigt die
 * Meldungen an.
 */
export function Meldungen({ children }: { children: ReactNode }) {
  useEffect(() => {
    const beiAblehnung = (ev: PromiseRejectionEvent) => {
      // Gemeldet ist gemeldet — die Konsole bekommt ihn trotzdem, damit eine Diagnose
      // nicht auf die Meldung angewiesen ist.
      fehlerMelden(ev.reason);
    };
    window.addEventListener("unhandledrejection", beiAblehnung);
    return () => window.removeEventListener("unhandledrejection", beiAblehnung);
  }, []);

  return (
    <Toast.Provider toastManager={verwalter} limit={3}>
      {children}
      <Liste />
    </Toast.Provider>
  );
}
