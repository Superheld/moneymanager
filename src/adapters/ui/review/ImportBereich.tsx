// Import — ein Navigationspunkt für alles, was Buchungen ins Haus bringt.
//
// Hier liegt, was aus einer DATEI kommt, und die Inbox, in der alles Eingelesene auf die
// Durchsicht wartet. Der Bankabruf ist bewusst NICHT hier: er hängt an einem Konto und
// steht deshalb unter Konten — beim Konto der Knopf, unter „Bankzugänge" die Verbindung.
//
// Die Datei liegt in `review/` und nicht in `import/`: sie zeigt die Inbox als Reiter, und
// die steht in der Rangfolge über dem Beleg. Wer zusammensetzt, steht so hoch wie das
// Höchste, das er zeigt (`adapters/ui/CLAUDE.md`, „Gliederung").

import { useTranslation } from "react-i18next";
import { Bereich } from "../bausteine/Bereich";
import { ImportScreen } from "../import/ImportScreen";
import { ReviewScreen } from "./ReviewScreen";
import type { ScreenId } from "../bausteine/AppShell";

/** `onNavigate` reicht die Inbox weiter: nach dem Verbuchen führt sie zum nächsten Schritt. */
export function ImportBereich({ onNavigate }: { onNavigate?: (id: ScreenId) => void } = {}) {
  const { t } = useTranslation();
  return (
    <Bereich
      titel={t("shell.navImport")}
      register={[
        {
          id: "datei",
          label: t("import.registerDatei"),
          untertitel: t("import.untertitel"),
          inhalt: () => <ImportScreen />,
        },
        {
          id: "inbox",
          label: t("import.registerInbox"),
          untertitel: t("review.untertitel"),
          inhalt: () => <ReviewScreen onNavigate={onNavigate} />,
        },
      ]}
    />
  );
}
