// Import — ein Navigationspunkt für alles, was Buchungen ins Haus bringt.
//
// Hier liegt, was aus einer DATEI kommt, und die Inbox, in der alles Eingelesene auf die
// Durchsicht wartet. Der Bankabruf ist bewusst NICHT hier: er hängt an einem Konto und
// steht deshalb unter Konten — beim Konto der Knopf, unter „Bankzugänge" die Verbindung.

import { useTranslation } from "react-i18next";
import { Bereich } from "../bausteine/Bereich";
import { ImportScreen } from "./ImportScreen";
import { ReviewScreen } from "./ReviewScreen";

export function ImportBereich() {
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
          inhalt: () => <ReviewScreen />,
        },
      ]}
    />
  );
}
