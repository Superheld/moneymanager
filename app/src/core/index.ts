// Öffentliche Oberfläche des Domänenkerns. Anwendungs- und Adapter-Schicht
// importieren NUR von hier, nie aus einzelnen Core-Dateien.
export * from "./geld";
export * from "./zahlungsregel";
export * from "./projektion";
export * from "./person";
export * from "./konto";
export * from "./kategorie";
