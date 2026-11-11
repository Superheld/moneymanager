// Einstellungen — Sprache & Währung, Personen, Kategorien. Anlegen UND
// Bearbeiten je im Modal (gleiche Maske, vorbefüllt). Reload-fest über die SQLite-Repos.
//
// Zwei Bereiche sind hier ausgezogen: die Kategorie-Erkennung nach „Training" und die
// Konten nach „Konten". Beides ist keine Einstellung, sondern eigene Arbeit — ein Konto
// hat einen Stand, eine Bankverbindung und bald einen Abruf auf Knopfdruck.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type Kategorie,
  type Person,
} from "../../../application";
import {
  stammdaten,
} from "../../dienste";
import { Bereich } from "../bausteine/Bereich";
import { VerschluesselungCard } from "../zugang/VerschluesselungCard";
import { ExportCard } from "./ExportCard";
import { BestandsexportCard } from "./BestandsexportCard";
import { KonfigurationImportCard } from "./KonfigurationImportCard";
import {
  useExperimentSchalter,
} from "../bausteine/einstellungenKontext";
import { RegionCard, ExperimenteCard, AktualisierungCard } from "./VerhaltenKarten";
import { PersonenCard, KategorienCard } from "./StammdatenKarten";


export function EinstellungenScreen({ onSperren }: { onSperren?: () => void }) {
  const { t } = useTranslation();
  // Nur zum Lesen: das Export-Register gibt es erst, wenn das Experiment an ist. Der
  // Hook liest aus dem Kontext, kostet also nichts, obwohl ihn die Experimente-Karte
  // weiter unten ebenfalls zieht.
  const { experimente } = useExperimentSchalter();
  const [personen, setPersonen] = useState<Person[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);

  async function laden() {
    const d = await stammdaten();
    setPersonen([...d.personen]);
    setKategorien([...d.kategorien]);
  }
  useEffect(() => {
    laden();
  }, []);

  return (
    <Bereich
      titel={t("einstellungen.titel")}
      register={[
        {
          id: "region",
          label: t("einstellungen.region.titel"),
          untertitel: t("einstellungen.region.untertitel"),
          inhalt: () => <RegionCard />,
        },
        {
          id: "personen",
          label: t("einstellungen.person.titel"),
          untertitel: t("einstellungen.person.untertitel"),
          inhalt: () => <PersonenCard personen={personen} onChange={laden} />,
        },
        {
          id: "kategorien",
          label: t("einstellungen.kategorie.titel"),
          untertitel: t("einstellungen.kategorie.untertitel"),
          inhalt: () => <KategorienCard kategorien={kategorien} onChange={laden} />,
        },
        {
          id: "aktualisierung",
          label: t("einstellungen.aktualisierung.titel"),
          untertitel: t("einstellungen.aktualisierung.untertitel"),
          inhalt: () => <AktualisierungCard />,
        },
        {
          id: "verschluesselung",
          label: t("zugang.kartenTitel"),
          untertitel: t("zugang.kartenText"),
          inhalt: () => <VerschluesselungCard onSperren={onSperren} />,
        },
        {
          id: "experimente",
          label: t("einstellungen.experiment.titel"),
          untertitel: t("einstellungen.experiment.untertitel"),
          inhalt: () => <ExperimenteCard />,
        },
        // Das Register erscheint erst, wenn das Experiment an ist — ein Reiter, der
        // seinen Inhalt nur mit einem Hinweis „erst einschalten" fuellt, ist ein
        // leeres Versprechen. Der Schalter darueber ist der Weg dorthin.
        ...(experimente.export
          ? [
              {
                id: "export",
                label: t("einstellungen.export.titel"),
                untertitel: t("einstellungen.export.untertitel"),
                inhalt: () => (
                  <>
                    <ExportCard />
                    <BestandsexportCard />
                    {/* Der Import steht UNTER den Exporten und nicht in einem eigenen
                        Register: es ist dieselbe Datei, einmal hinaus und einmal herein.
                        Wer den Reiter „Export" offen hat, hat die Frage schon gestellt. */}
                    <KonfigurationImportCard />
                  </>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

