// Öffentliche Oberfläche des Domänenkerns. Anwendungs- und Adapter-Schicht
// importieren NUR von hier, nie aus einzelnen Core-Dateien.
export * from "./datum";
export * from "./fehler";
export * from "./waehrung";
export * from "./region";
export * from "./geld";
export * from "./zahlungsregel";
export * from "./projektion";
export * from "./person";
export * from "./konto";
export * from "./kategorie";
export * from "./vertrag";
export * from "./muster";
export * from "./vertragErkennung";
export * from "./vertragZuordnung";
export * from "./kategoriefestlegung";
export * from "./budget";
export * from "./budgetVorschlag";
export * from "./inventar";
export * from "./istbuchung";
export * from "./kontoregister";
export * from "./historie";
export * from "./monatsausblick";
export * from "./klassifikator/merkmale";
export * from "./klassifikator/modell";
