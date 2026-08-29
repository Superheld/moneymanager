// Trainingsmaterial — was vom gebuchten Bestand als Lernbeispiel taugt, und was nicht.
//
// Die Frage steht VOR dem Modell, nicht daneben: ein Klassifikator, der auf dem ganzen
// Bestand trainiert, von dem ein Teil gar keine Kategorie trägt und ein weiterer
// aufgeteilt ist, lernt
// stillschweigend etwas anderes, als man glaubt. Deshalb wird hier gezählt und begründet,
// bevor irgendwo gerechnet wird — und dasselbe Ergebnis speist die Anzeige in den
// Einstellungen.
//
// Reine Anwendungsschicht: lädt über die Ports, rechnet mit dem Kern
// (`core/klassifikator/merkmale`), entscheidet nichts über Modelle.

import {
  herkunftVon,
  merkmalName,
  merkmalsbefund,
  namensraum,
  STANDARD_KONFIGURATION,
  type Merkmalsherkunft,
  type Merkmalskonfiguration,
  type Verwurfsgrund,
  type Zahlungsspur,
} from "../../core";
import type { LedgerPort, UmsatzRepository } from "../ports";
import { zahlungsspuren } from "../buchung/zahlungsspuren";

/** Ein fertiges Lernbeispiel: Tokens plus die Kategorie, die dabei herauskommen soll. */
export interface Lernbeispiel {
  readonly istbuchungId: string;
  readonly merkmale: readonly string[];
  readonly kategorieId: string;
}

/** Warum eine Buchung nicht als Beispiel taugt. */
export type Ausschlussgrund =
  /** Keine Kategorie — es gibt nichts zu lernen, das ist ja gerade die offene Frage. */
  | "ohneKategorie"
  /** Aufgeteilt: mehrere Kategorien auf einer Zeile, kein eindeutiges Label. */
  | "geteilt"
  /** Umschichtung — eigenes Geld, das das Konto wechselt. Trägt fachlich keine Kategorie. */
  | "umschichtung"
  /** Weder Empfänger noch Verwendungszweck noch Gläubiger-ID: der Vektor wäre leer. */
  | "ohneText";

export interface Materialbefund {
  /** Alle gebuchten Zahlungen, die betrachtet wurden. */
  readonly gesamt: number;
  /** Die brauchbaren Beispiele — die Grundlage jedes Trainings. */
  readonly beispiele: readonly Lernbeispiel[];
  /** Wie viele Buchungen aus welchem Grund draußen blieben. */
  readonly ausgeschlossen: Readonly<Record<Ausschlussgrund, number>>;
  /** Wie viele verschiedene Kategorien überhaupt belegt sind (die Klassen des Modells). */
  readonly kategorien: number;
  /**
   * Kategorien mit sehr wenigen Beispielen. Sie sind der häufigste Grund für eine
   * Klasse, die das Modell faktisch nie vorhersagt — sichtbar zu machen ist billiger,
   * als sich später über eine Kategorie zu wundern, die nie vorkommt.
   */
  readonly duenneKategorien: readonly { readonly kategorieId: string; readonly anzahl: number }[];
  readonly vokabular: Vokabularbefund;
}

export interface Vokabularbefund {
  /** Verschiedene Tokens insgesamt. */
  readonly groesse: number;
  /** Tokens je Namensraum (`emp`, `vwz`, `gid`, `vz`). */
  readonly jeNamensraum: Readonly<Record<string, number>>;
  /**
   * ALLE Tokens mit ihren Maßzahlen, häufigste zuerst.
   *
   * Vollständig und nicht als Bestenliste, und das ist der Punkt: die gekappten
   * fünfundzwanzig waren nicht „die wichtigsten", sondern die Spitze eines Bestands,
   * dessen Rest sich schlicht nicht erreichen liess. Wer ein bestimmtes Wort suchte,
   * konnte es nur finden, wenn es zufällig oben stand — und ein Werkzeug, das nur die
   * Spitze zeigt, führt zur Pflege der Spitze.
   *
   * Ausgedünnt wird in der OBERFLÄCHE (suchen, filtern, blättern), nicht hier: eine
   * Kappung an der Quelle nimmt der Oberfläche die Möglichkeit, anders zu sortieren.
   */
  readonly merkmale: readonly Merkmalswert[];
  /**
   * Dieselben Maße für die Wörter, die auf der Ausschlussliste stehen — was sie BRÄCHTEN.
   *
   * Sie sind kein Teil des Vokabulars und dürfen nirgends dazugezählt werden; sie stehen
   * daneben, damit ein Ausschluss an denselben Zahlen zu beurteilen ist wie eine
   * Aufnahme. Eine Liste, deren Einträge nur ihren eigenen Namen tragen, lädt dazu ein,
   * sie nach Aussehen zu pflegen — und genau das verschlechtert das Modell.
   */
  readonly gesperrte: readonly Merkmalswert[];
  /**
   * Tokens, die genau EINMAL vorkommen. Sie können nichts generalisieren und sind das
   * beste Maß dafür, ob die Filter zu lasch sind: steigt der Anteil, rutscht wieder
   * Referenznummern-Müll durch.
   */
  readonly einmalige: number;
  /** Wie viele Wörter die Filter verworfen haben, nach Grund. */
  readonly verworfen: Readonly<Record<Verwurfsgrund, number>>;
  /** Alle verworfenen Wörter mit ihrer Häufigkeit, häufigste zuerst. */
  readonly verworfeneWoerter: readonly VerworfenesWortWert[];
}

/**
 * Ein Merkmal mit dem, was es taugt.
 *
 * `konzentration` ist der Anteil der häufigsten Kategorie an allen Belegen und damit das
 * Maß, das beim Ausschließen zählt — nicht die Häufigkeit. Ein Wort, das oft vorkommt
 * und dabei zu 100 % in einer Kategorie liegt, ist ein scharfes Merkmal; eines mit
 * ähnlich vielen Belegen quer über ein Dutzend Kategorien ist Rauschen, egal wie
 * vertraut es aussieht. Ohne diese Zahl neben dem Wort wäre die Pflege der Ausschlussliste ein
 * Ratespiel, das das Modell verschlechtert.
 */
export interface Merkmalswert {
  readonly merkmal: string;
  readonly herkunft: Merkmalsherkunft | null;
  /** Zeilen, in denen das Merkmal vorkommt. Das ABSOLUTE Vorkommen. */
  readonly belege: number;
  /**
   * Anteil der Beispiele, in denen das Merkmal steht (0…1). Das RELATIVE Vorkommen.
   *
   * Die Untergrenze der Brauchbarkeit: was in fast jeder Zeile steht, kann per
   * Konstruktion nichts trennen — eine gemessene Stoppwortliste statt einer geratenen.
   * Nach oben sagt sie nichts: ein seltenes Wort kann scharf oder wertlos sein.
   */
  readonly deckung: number;
  /** Über wie viele verschiedene Kategorien sich diese Belege verteilen. */
  readonly kategorien: number;
  /** Anteil der häufigsten Kategorie (0…1). 1 = immer dieselbe. */
  readonly konzentration: number;
  /**
   * Wie viel Unsicherheit über die Kategorie dieses Merkmal wegräumt (0…1) — der Anteil
   * der Gesamtentropie, den es erklärt (Information Gain, geteilt durch H(Kategorie)).
   *
   * Sie ist das einzige der vier Maße, das Häufigkeit UND Verteilung zusammen nimmt, und
   * sie beantwortet die Frage, an der die anderen drei einzeln scheitern:
   *
   *   • Die Konzentration allein überschätzt das Seltene — ein Wort mit zwei Belegen in
   *     einer Kategorie steht bei 100 % und kann trotzdem nichts.
   *   • Die Kategorienzahl allein bestraft das Häufige — ein Supermarkt in vier
   *     Kategorien ist ein starkes Merkmal, weil er die übrigen ausschliesst.
   *   • Die Deckung allein sieht die Kategorien überhaupt nicht.
   *
   * Der Vergleich läuft gegen die Grundverteilung des Bestands, nicht gegen die
   * Gleichverteilung: ein Wort, dessen Belege sich verteilen wie der Bestand insgesamt,
   * hat Trennkraft nahe null, auch wenn seine häufigste Kategorie gross aussieht.
   *
   * Die Werte sind klein — ein einzelnes Wort erklärt selten viel vom Ganzen. Es zählt
   * die Reihenfolge, nicht die Höhe.
   */
  readonly trennkraft: number;
  /** Die häufigste Kategorie — wofür das Merkmal spricht. */
  readonly haeufigsteKategorieId: string;
  /**
   * Wohin sich die Belege verteilen, absteigend. Vollständig, nicht gekappt: die Frage
   * „in welchen Kategorien steckt dieses Wort und wie oft" ist der Grund, aus dem man
   * eine solche Liste überhaupt aufmacht, und eine Antwort mit „… und weitere" verlangt
   * genau dort einen zweiten Weg, wo man gerade steht.
   *
   * Kostet nichts an Speicher, was nicht ohnehin gezählt würde: die Summe über alle
   * Merkmale ist die Zahl der belegten (Merkmal, Kategorie)-Paare — dieselbe Menge, aus
   * der die drei Zahlen darüber entstehen.
   */
  readonly verteilung: readonly { readonly kategorieId: string; readonly anzahl: number }[];
}

export interface VerworfenesWortWert {
  readonly wort: string;
  readonly grund: Verwurfsgrund;
  readonly herkunft: Merkmalsherkunft;
  readonly anzahl: number;
  /** Die Form auf der Ausschlussliste — nur bei `grund === "ausgeschlossen"`. */
  readonly listenform?: string;
}

/** Ab wie wenigen Beispielen eine Kategorie als dünn gilt. */
const DUENN_AB = 5;


/**
 * Wertet den gebuchten Bestand als Trainingsmaterial aus. Reine Funktion über bereits
 * geladene Spuren — die Ladung steckt in `trainingsmaterial()`.
 */
export function materialBefund(
  spuren: readonly Zahlungsspur[],
  konfiguration: Merkmalskonfiguration = STANDARD_KONFIGURATION,
): Materialbefund {
  const beispiele: Lernbeispiel[] = [];
  const ausgeschlossen: Record<Ausschlussgrund, number> = {
    ohneKategorie: 0, geteilt: 0, umschichtung: 0, ohneText: 0,
  };
  const jeKategorie = new Map<string, number>();
  const tokenZaehler = new Map<string, number>();
  // Je Merkmal die Kategorien seiner Belege — daraus entsteht die Trennschärfe.
  const tokenKategorien = new Map<string, Map<string, number>>();
  const verworfen: Record<Verwurfsgrund, number> = {
    zuKurz: 0, ziffern: 0, platzhalter: 0, ausgeschlossen: 0,
  };
  const verworfenZaehler = new Map<string, VerworfenesWortWert>();
  // Was ein GESPERRTES Wort brächte, wenn man es zuliesse — an derselben Beispielmenge
  // gemessen wie das, was drin ist. Ohne diese Zahlen ist die Ausschlussliste eine Liste
  // von Behauptungen: man sieht erst, was ein Ausschluss kostet, nachdem man ihn
  // zurückgenommen und neu gerechnet hat. Das ist die Reihenfolge, in der niemand
  // entscheidet.
  const gesperrtKategorien = new Map<string, Map<string, number>>();

  for (const s of spuren) {
    // Reihenfolge der Prüfungen = Reihenfolge der Aussagekraft. Eine geteilte Buchung
    // ohne Kategorie soll als „geteilt" gezählt werden, nicht als „ohne Kategorie" —
    // sonst liest sich die Anzeige, als fehlte dort nur ein Eintrag.
    if (s.geteilt) {
      ausgeschlossen.geteilt++;
      continue;
    }
    if (s.charakter === "Umschichtung") {
      ausgeschlossen.umschichtung++;
      continue;
    }
    if (!s.kategorieId) {
      ausgeschlossen.ohneKategorie++;
      continue;
    }

    const befund = merkmalsbefund(
      {
        gegenpartei: s.gegenpartei,
        verwendungszweck: s.verwendungszweck ?? "",
        glaeubigerId: s.glaeubigerId,
        betrag: s.betrag,
      },
      konfiguration,
    );

    // Ein Vektor, in dem nur das Vorzeichen steht, ist kein Beispiel — er behauptet,
    // „Abfluss" allein bestimme die Kategorie, und zieht das Modell zur häufigsten Klasse.
    const inhalt = befund.merkmale.filter((m) => namensraum(m) !== "vz");
    if (inhalt.length === 0) {
      ausgeschlossen.ohneText++;
      continue;
    }

    // Verwurf und Vokabular werden über DIESELBE Grundmenge gezählt: die Beispiele.
    // Verlockend wäre, den Verwurf über alle Zeilen laufen zu lassen — auch die noch
    // unkategorisierten, deren Text ja ebenfalls durch die Filter geht. Dann bezögen sich
    // „5321 Tokens im Vokabular" und „1284 Wörter verworfen" aber auf verschiedene Mengen
    // und ließen sich nicht mehr gegeneinander lesen. Genau dafür stehen die Zahlen da.
    // Je Zeile EINMAL zählen, auch wenn dasselbe Wort mehrfach im Verwendungszweck
    // steht — sonst zählt eine Zeile als mehrere Belege, und die Deckung des Wortes
    // stiege über die des Vokabulars, das genau hier dedupliziert.
    const gesperrtHier = new Set<string>();
    for (const v of befund.verworfen) {
      verworfen[v.grund]++;
      if (v.grund === "ausgeschlossen" && v.listenform) {
        gesperrtHier.add(merkmalName(v.herkunft, v.listenform));
      }
      // Nach Wort UND Herkunft: dasselbe Wort kann im Empfängerfeld ausgeschlossen und
      // im Verwendungszweck erlaubt sein — als ein Eintrag wäre nicht zu sehen, welcher
      // Fall gemeint ist.
      const schluessel = `${v.herkunft} ${v.wort}`;
      const eintrag = verworfenZaehler.get(schluessel);
      if (eintrag) verworfenZaehler.set(schluessel, { ...eintrag, anzahl: eintrag.anzahl + 1 });
      else verworfenZaehler.set(schluessel, { wort: v.wort, grund: v.grund, herkunft: v.herkunft, anzahl: 1, listenform: v.listenform });
    }

    for (const schluessel of gesperrtHier) {
      let verteilung = gesperrtKategorien.get(schluessel);
      if (!verteilung) {
        verteilung = new Map();
        gesperrtKategorien.set(schluessel, verteilung);
      }
      verteilung.set(s.kategorieId, (verteilung.get(s.kategorieId) ?? 0) + 1);
    }

    beispiele.push({ istbuchungId: s.id, merkmale: befund.merkmale, kategorieId: s.kategorieId });
    jeKategorie.set(s.kategorieId, (jeKategorie.get(s.kategorieId) ?? 0) + 1);
    for (const m of befund.merkmale) {
      tokenZaehler.set(m, (tokenZaehler.get(m) ?? 0) + 1);
      let verteilung = tokenKategorien.get(m);
      if (!verteilung) {
        verteilung = new Map();
        tokenKategorien.set(m, verteilung);
      }
      verteilung.set(s.kategorieId, (verteilung.get(s.kategorieId) ?? 0) + 1);
    }
  }

  const jeNamensraum: Record<string, number> = {};
  let einmalige = 0;
  for (const [merkmal, anzahl] of tokenZaehler) {
    const raum = namensraum(merkmal);
    jeNamensraum[raum] = (jeNamensraum[raum] ?? 0) + 1;
    if (anzahl === 1) einmalige++;
  }

  return {
    gesamt: spuren.length,
    beispiele,
    ausgeschlossen,
    kategorien: jeKategorie.size,
    duenneKategorien: [...jeKategorie]
      .filter(([, n]) => n < DUENN_AB)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([kategorieId, anzahl]) => ({ kategorieId, anzahl })),
    vokabular: {
      groesse: tokenZaehler.size,
      jeNamensraum,
      merkmale: merkmalswerte(tokenKategorien, jeKategorie, beispiele.length),
      gesperrte: merkmalswerte(gesperrtKategorien, jeKategorie, beispiele.length),
      einmalige,
      verworfen,
      verworfeneWoerter: [...verworfenZaehler]
        .sort((a, b) => b[1].anzahl - a[1].anzahl || a[0].localeCompare(b[0]))
        .map(([, e]) => e),
    },
  };
}

/** `x · log2 x`, mit der üblichen Festlegung 0·log 0 = 0. */
function xlogx(x: number): number {
  return x > 0 ? x * Math.log2(x) : 0;
}

/**
 * Bewertet ALLE Merkmale in einem Durchgang — Deckung, Konzentration, Trennkraft.
 *
 * Die Trennkraft ist ein Information Gain über eine 2×K-Tafel: „Merkmal da" gegen
 * „Merkmal nicht da", je aufgeschlüsselt nach Kategorie. Die zweite Hälfte davon ist die
 * teure: sie läuft über ALLE Kategorien, auch die, in denen das Merkmal nie vorkommt —
 * über das ganze Vokabular wären das Vokabelgrösse × Kategorien Schritte.
 *
 * Der Umweg, der das erspart, steckt in der Umformung der Entropie:
 *
 *     H = log2(N) − (1/N) · Σ xlogx(n_k)
 *
 * Die Summe über die Komplementmenge lässt sich damit aus einer EINMAL gerechneten Summe
 * über den ganzen Bestand gewinnen, korrigiert um genau die Kategorien, in denen das
 * Merkmal vorkommt. Damit kostet die Bewertung eines Merkmals nur so viel, wie es
 * Kategorien BELEGT — und die Rechnung bleibt linear in der Zahl der belegten Paare,
 * also in derselben Grössenordnung wie das Zählen davor.
 */
function merkmalswerte(
  tokenKategorien: ReadonlyMap<string, ReadonlyMap<string, number>>,
  jeKategorie: ReadonlyMap<string, number>,
  gesamt: number,
): Merkmalswert[] {
  // Σ xlogx über den ganzen Bestand — der Bezugspunkt für jedes Komplement.
  let summeGesamt = 0;
  for (const n of jeKategorie.values()) summeGesamt += xlogx(n);
  const entropie = gesamt > 0 ? Math.log2(gesamt) - summeGesamt / gesamt : 0;

  const werte: Merkmalswert[] = [];
  for (const [merkmal, verteilungMap] of tokenKategorien) {
    let belege = 0;
    let groesste = 0;
    let haeufigsteKategorieId = "";
    // `mit` = Σ xlogx innerhalb der Belege, `korrektur` = was das Komplement in genau
    // diesen Kategorien anders sieht als der Gesamtbestand.
    let mit = 0;
    let korrektur = 0;
    for (const [kategorieId, n] of verteilungMap) {
      belege += n;
      if (n > groesste || (n === groesste && kategorieId < haeufigsteKategorieId)) {
        groesste = n;
        haeufigsteKategorieId = kategorieId;
      }
      mit += xlogx(n);
      const imBestand = jeKategorie.get(kategorieId) ?? n;
      korrektur += xlogx(imBestand - n) - xlogx(imBestand);
    }

    const ohneAnzahl = gesamt - belege;
    const hMit = belege > 0 ? Math.log2(belege) - mit / belege : 0;
    // Ein Merkmal, das in JEDER Zeile steht, hat kein Komplement — der Term entfällt,
    // statt über log2(0) zu stolpern.
    const hOhne =
      ohneAnzahl > 0 ? Math.log2(ohneAnzahl) - (summeGesamt + korrektur) / ohneAnzahl : 0;
    const gewinn =
      gesamt > 0 ? entropie - (belege / gesamt) * hMit - (ohneAnzahl / gesamt) * hOhne : 0;

    werte.push({
      merkmal,
      herkunft: herkunftVon(merkmal),
      belege,
      deckung: gesamt > 0 ? belege / gesamt : 0,
      kategorien: verteilungMap.size,
      konzentration: belege ? groesste / belege : 0,
      // Geklemmt: die Umformung rechnet mit Gleitkomma, und ein Gewinn von −1e−16 wäre
      // kein Befund, sondern eine Rundung — als negative Prozentzahl sähe er nach einem
      // aus, den es zu deuten gälte.
      trennkraft: entropie > 0 ? Math.min(1, Math.max(0, gewinn / entropie)) : 0,
      haeufigsteKategorieId,
      verteilung: [...verteilungMap]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([kategorieId, anzahl]) => ({ kategorieId, anzahl })),
    });
  }

  // Häufigste zuerst, bei Gleichstand alphabetisch — eine stabile Grundordnung, auf der
  // die Oberfläche jede andere Sortierung aufsetzen kann.
  return werte.sort(
    (a, b) => b.belege - a.belege || a.merkmal.localeCompare(b.merkmal),
  );
}

/** Lädt den Bestand und wertet ihn aus. */
export async function trainingsmaterial(
  ledger: LedgerPort,
  umsatzRepo: UmsatzRepository,
  konfiguration?: Merkmalskonfiguration,
): Promise<Materialbefund> {
  return materialBefund(await zahlungsspuren(ledger, umsatzRepo), konfiguration);
}
