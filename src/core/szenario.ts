// Szenario — benannte, verwerfbare What-if-Schicht (SPEC US-E2). Die Deltas sind
// Zusatz-Zahlungsregeln (Zusatzposten), die NUR für die „mit Szenario"-Projektion zur
// Basis hinzukommen. Das Szenario berührt die Plan-Schicht nie (eigene Tabelle).

export interface Szenario {
  readonly id: string;
  readonly name: string;
}
