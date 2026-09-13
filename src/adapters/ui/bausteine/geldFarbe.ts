// Die eine Regel, welche Farbe eine Zahl in der Auswertung trägt.
//
// Vorher stand sie viermal im Baum, jedes Mal etwas anders: KontenScreen färbte
// Zuflüsse grün und Abflüsse schwarz (Umschichtungen teal), MonatsAusblick färbte nur
// das Minus, die Historie nur die Netto-Spalte, und die meisten Tabellen färbten gar
// nicht. Derselbe Betrag sah je nach Screen anders aus — und „schwarz" hiess mal
// „Ausgabe", mal „unauffällig".
//
// Das war 2026-08-19 für BETRÄGE gelöst und am 13.09.2026 für die Auswertung insgesamt:
// dort liefen zwei Farbsprachen nebeneinander, die beide `--warn-deep` malten. Die eine
// meinte „Geld geht raus", die andere „sieh hin" — und weil sie gleich aussahen, konnte
// niemand die Frage beantworten, die eine rote Zahl stellt.
//
// ── DIE REGEL ──────────────────────────────────────────────────────────────────────
//
// **1. Gerichtetes Geld — Farbe ist RICHTUNG.** Trägt der Betrag sein Vorzeichen als
//    Aussage (Saldo, Netto, Rest, Einnahmen, Ausgaben), kommt die Farbe aus dem
//    Vorzeichen und aus nichts sonst: `geldFarbe` für Text, `geldTon` für `KPIStat`,
//    `flussFarbe` für Flächen. Nie handverdrahtet, nie mit eigener Schwelle.
//
// **2. Ungerichtete Grösse — neutral, warnend nur an einer Schwelle.** Eine Höhe ohne
//    Richtung (Rahmen, Verbrauch, Anzahl) und alles, was kein Geld ist (Prozent,
//    Monate) hat keine Richtung, also auch keine Richtungsfarbe. Sie bleibt neutral und
//    wird über `warnTon` amber, wenn eine Schwelle überschritten ist — **nie grün.**
//
//    Das „nie grün" ist der Teil, den man sonst wegdiskutiert: es ist dieselbe
//    Überlegung, aus der die Handlungsbedarf-Karte VERSCHWINDET, statt „alles in
//    Ordnung" zu schreiben. Ein Dauergrün liest nach zwei Wochen niemand mehr, und
//    dann fällt auch das Rot daneben nicht mehr auf. Eine Sparquote von 0,4 % grün zu
//    färben war genau dieser Fehler.
//
// **3. Flächen tragen dieselbe Aussage, eine Stufe heller.** Ein Abfluss ist in der
//    Zahl und im Balken derselbe — vorher war er in der Analyse in vier Tönen gemalt.
//    Balken und Linien nehmen `--ok`/`--warn`, Text `--ok-deep`/`--warn-deep`. Das ist
//    keine Ausnahme, sondern das Tokenset: die `-deep`-Paare sind ausdrücklich die
//    Töne für Schrift auf hellem Grund, die anderen die für Fläche.
//
// **Wo Bewertung weiterhin hingehört: in die Pille und in die Meta-Zeile.** Dort steht
// ein WORT, und ein Wort wird gelesen — eine grüne Pille „stabil" sagt etwas, eine
// grüne Zahl sagt nur „grün". Deshalb darf `Pill` grün sein und eine Zahl nicht.
//
// **Die Kante, die dabei offen bleibt: ein BESTAND ist kein Fluss.** „Plus ist grün"
// heisst bei einer Einnahme „Geld kam herein" und bei einem Kontosaldo nur „es ist Geld
// da" — und weil das der Normalfall ist, steht dort dauerhaft Grün, also genau das, was
// Regel 2 nebenan verbietet. Eine dritte Klasse „Bestand: positiv neutral, negativ warn"
// wäre die genauere Antwort und ist bewusst NICHT gebaut: die Grenze zwischen Bestand und
// Fluss ist unscharf (ein Budgetrest ist beides, je nachdem wonach man fragt), `geldFarbe`
// steht seit 2026-08-19 überall im Bestand-Sinn im Einsatz, und eine Regel mit einer
// Grenze, die jeder anders zieht, ist schlechter als eine mit einem benannten Preis.
// Wer sie doch zieht, zieht sie hier und nirgends sonst.
//
// `--warn-deep` trägt damit weiterhin zwei Bedeutungen (Abfluss und Warnung). Das
// bleibt bewusst so: lieber ein Ton weniger als ein Ton, den niemand benennen kann.
// Auseinander hält sie die Regel oben — an einer gerichteten Zahl heisst amber immer
// Abfluss, an einer ungerichteten immer Warnung. Zwei Bedeutungen, die sich nie am
// selben Wert treffen.

/** Der Ton, den `KPIStat` versteht. */
export type Farbton = "default" | "plan" | "warn" | "ok";

/**
 * Farbe eines GERICHTETEN Betrags — als CSS-Wert, direkt in `style.color`.
 *
 * Für Text. Eine Fläche nimmt `flussFarbe`, eine Kennzahl ohne Richtung gar nichts.
 */
export function geldFarbe(betrag: number): string {
  if (betrag > 0) return "var(--ok-deep)";
  if (betrag < 0) return "var(--warn-deep)";
  return "var(--ink-3)";
}

/**
 * Dasselbe für eine FLÄCHE — Balken, Linie, Tortenstück.
 *
 * Eine Stufe heller als der Text, weil eine Fläche bei gleichem Ton schwerer wirkt als
 * eine Ziffer. Die Aussage ist identisch; wer hier ein anderes Token nimmt, macht aus
 * einer Helligkeitsstufe eine zweite Sprache.
 */
export function flussFarbe(betrag: number): string {
  if (betrag > 0) return "var(--ok)";
  if (betrag < 0) return "var(--warn)";
  return "var(--ink-3)";
}

/**
 * Der `tone` für ein `KPIStat`, dessen Wert GERICHTETES Geld ist.
 *
 * Es gibt ihn, damit an der Kennzahl dieselbe Regel greift wie an der Zahl in der
 * Tabelle darunter. Vorher stand dort fünfmal ein eigenes Ternär, und drei davon waren
 * verschieden: Einnahmen fest auf grün, Ausgaben „warn, wenn negativ" (also immer),
 * und die positive Seite mal grün, mal neutral — in derselben Reihe nebeneinander.
 */
export function geldTon(betrag: number): Farbton {
  if (betrag > 0) return "ok";
  if (betrag < 0) return "warn";
  return "default";
}

/**
 * Der `tone` für eine Kennzahl OHNE Richtung — Prozent, Monate, Anzahl, blosse Höhe.
 *
 * Genau zwei Ausgänge, und grün ist keiner davon (siehe Regel 2 im Kopf). Der Aufruf
 * liest sich als das, was er ist: `warnTon(quote < 0)` — eine Schwelle, die jemand
 * gesetzt hat, und nicht eine Farbe, die jemand schön fand.
 */
export function warnTon(auffaellig: boolean): Farbton {
  return auffaellig ? "warn" : "default";
}

/**
 * Die Textfarbe für eine ungerichtete Grösse an ihrer Schwelle — das Gegenstück zu
 * `warnTon` ausserhalb eines `KPIStat`.
 *
 * Es gibt sie, damit niemand mehr `var(--warn-deep)` von Hand hinschreiben muss: genau so
 * sind die beiden Farbsprachen entstanden. `undefined` heisst „erbt", nicht „grau" — eine
 * unauffällige Zahl soll aussehen wie der Text um sie herum.
 */
export function warnFarbe(auffaellig: boolean): string | undefined {
  return auffaellig ? "var(--warn-deep)" : undefined;
}

/**
 * Der Flächenton für eine ungerichtete Grösse an ihrer Schwelle — `warnFarbe` für Balken.
 *
 * Sie fehlte zuerst, und prompt stand am Überziehungsbalken der Textton `--warn-deep`:
 * derselbe Griff, aus dem die zweite Farbsprache entstanden ist. Jede der vier Fragen
 * (Text/Fläche × gerichtet/Schwelle) hat deshalb genau eine Funktion.
 */
export function warnFlaeche(auffaellig: boolean): string | undefined {
  return auffaellig ? "var(--warn)" : undefined;
}

