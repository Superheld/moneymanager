/**
 * Hervorhebungen für <Trans>-Fließtexte.
 *
 * react-i18next gibt den übersetzten Text als flaches Array aus Strings und
 * geklonten Elementen zurück. React sieht darin eine Liste — die übergebenen
 * Elemente brauchen deshalb einen `key`, sonst warnt jeder Screen mit
 * ausgezeichnetem Text ("Each child in a list should have a unique key prop").
 * Der key gehört ans Quell-Element hier, nicht an die Klone.
 */
export const betont = { b: <b key="b" style={{ color: "var(--ink)" }} /> };
