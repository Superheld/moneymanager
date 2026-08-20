// Training — eigener Navigationspunkt für die Kategorie-Erkennung.
//
// Vorher lagen die fünf Schritte der Kette (Daten → Merkmale → Ausschlüsse → Modell →
// Abgleich) als Klappkarten unten in den Einstellungen. Das war der Ort, an dem sie
// historisch entstanden sind, nicht der, an dem man sie sucht: Einstellungen sind
// Stammdaten, Training ist Arbeit am Modell.

import { useEffect, useState } from "react";
import type { Kategorie } from "../../../application";
import { stammdaten } from "../../dienste";
import { KategorisierungCards } from "./KategorisierungCards";

export function TrainingBereich() {
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);

  useEffect(() => {
    stammdaten()
      .then((d) => setKategorien([...d.kategorien]))
      .catch(() => setKategorien([])); // reiner Browser-Modus ohne SQLite
  }, []);

  return <KategorisierungCards kategorien={kategorien} />;
}
