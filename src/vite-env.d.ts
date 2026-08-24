/// <reference types="vite/client" />

// Build-Konfiguration. Die FinTS-Produktnummer steht bewusst NICHT im Quelltext, sondern
// kommt aus der (gitignorierten) `.env` bzw. beim Release aus einem Repository-Secret.
interface ImportMetaEnv {
  readonly VITE_FINTS_PRODUKT_ID?: string;
  /**
   * Ausdrücklich gewählte Datenbankdatei — überstimmt die Trennung nach `DEV`. Gedacht
   * für den Fall, in dem die Entwicklung ausnahmsweise auf eine Lesekopie des echten
   * Bestands zeigen soll (Fehlersuche). Siehe `persistence/datenbankdatei.ts`.
   */
  readonly VITE_DB_DATEI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
