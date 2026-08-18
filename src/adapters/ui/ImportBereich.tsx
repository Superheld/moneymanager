// Import — ein Navigationspunkt für alles, was Buchungen ins Haus bringt.
//
// Vorher standen drei Einträge nebeneinander (Import, Bankabruf, Import-Inbox), die
// dieselbe Sache in drei Schritten sind: woher die Daten kommen (Datei oder Bank) und was
// danach mit ihnen passiert (Inbox). Als Register bleibt der Weg sichtbar, ohne die
// Seitenleiste zu füllen.

import { useTranslation } from "react-i18next";
import { Bereich } from "./Bereich";
import { BankabrufScreen } from "./BankabrufScreen";
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
          id: "bank",
          label: t("import.registerBank"),
          untertitel: t("bankabruf.untertitel"),
          inhalt: () => <BankabrufScreen />,
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
