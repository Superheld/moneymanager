// Training — eigener Navigationspunkt für die Kategorie-Erkennung.
//
// Vorher lagen die fünf Schritte der Kette (Daten → Merkmale → Ausschlüsse → Modell →
// Abgleich) als Klappkarten unten in den Einstellungen. Das war der Ort, an dem sie
// historisch entstanden sind, nicht der, an dem man sie sucht: Einstellungen sind
// Stammdaten, Training ist Arbeit am Modell.

import { useEffect, useState } from "react";
import type { Kategorie } from "../../core";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { KategorisierungCards } from "./KategorisierungCards";

export function TrainingBereich() {
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);

  useEffect(() => {
    kategorieRepo
      .alle()
      .then(setKategorien)
      .catch(() => setKategorien([])); // reiner Browser-Modus ohne SQLite
  }, []);

  return <KategorisierungCards kategorien={kategorien} />;
}
