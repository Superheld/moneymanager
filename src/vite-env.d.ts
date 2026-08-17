/// <reference types="vite/client" />

// Build-Konfiguration. Die FinTS-Produktnummer steht bewusst NICHT im Quelltext, sondern
// kommt aus der (gitignorierten) `.env` bzw. beim Release aus einem Repository-Secret.
interface ImportMetaEnv {
  readonly VITE_FINTS_PRODUKT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
