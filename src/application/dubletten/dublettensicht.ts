// Was die Dublettenprüfung beim HINSEHEN sagt — für alle Anzeigen dieselbe Antwort.
//
// Die Prüfung hing an zwei Stellen: das Register rechnete sie in `kontensichten`, der
// Buchungsdialog noch einmal für sich. Beide riefen denselben Finder, aber mit anderem
// Bestand — und gaben deshalb verschiedene Auskünfte über dieselbe Buchung. Gemeldet
// wurde es an der schmerzhaften Stelle: der Zwilling war längst gelöscht, das Register
// schwieg, der Dialog mahnte weiter.
//
// Es gibt genau DREI Fragen, und sie sind wirklich verschieden:
//
//   • `ledgerVerdacht` — steht dieselbe Zahlung ZWEIMAL IM SALDO? Zählt nur, was verbucht
//     ist UND dessen Buchung es noch gibt. Ein verworfener Umsatz steht in keinem Saldo.
//   • `entwurfVerdacht` / `stapelVerdacht` — ist diese noch nicht verbuchte Bankzeile SCHON
//     BEKANNT? Zählt alles auf dem Konto, auch Verworfenes: „das habe ich schon einmal
//     weggelegt" ist genau die Auskunft, die man beim Durchsehen braucht. Zwei Formen
//     derselben Frage: eine Zeile im Dialog, der ganze Stapel in der Inbox — der Stapel
//     braucht die 1:1-Regel, die einzelne Zeile nicht (siehe `stapelVerdacht`).
//   • `fremdkontoZwilling` — liegt dieselbe QUELLZEILE auf einem ANDEREN Konto? Seit dem
//     07.09.2026, und die einzige der drei, die die Kontogrenze überschreitet. Warum sie
//     eine eigene Frage ist und keine Erweiterung der beiden anderen, steht bei ihr.
//
// Sie stehen hier nebeneinander, damit der Unterschied eine Begründung hat statt eines
// Zufalls. Wer eine weitere Anzeige baut, nimmt eine davon — oder erklärt hier, warum es
// eine weitere Frage gibt.
//
// Gerechnet wird beim Lesen, nicht einmalig beim Import: ein Verdacht, den ein Import an
// die Zeile schreibt, gilt für den Stand von damals, und was später aus einer anderen
// Quelle dazukam, würde nie nachträglich angeschrieben.

import { belegSchluessel, ordneZu, paareImBestand, PUNKTE_SICHER, type Bewertung, type Umsatz } from "../import";

/**
 * Was die Prüfung zu einer Zeile sagt.
 *
 * Es gibt bewusst kein „Original" und keine „Kopie": beide Zeilen liegen im Bestand, und
 * welche davon weg soll, entscheidet niemand automatisch. Deshalb wird bei einem Fund im
 * Ledger auch BEIDEN Zeilen der Verdacht angeschrieben.
 */
export interface Dublettenverdacht {
  readonly urteil: Bewertung["urteil"];
  readonly punkte: number;
  /** Warum — im Klartext, damit eine Fehleinschätzung nachvollziehbar bleibt. */
  readonly gruende: readonly string[];
  /** Die andere Zeile. Der Umsatz ist immer da, die Ist-Buchung nur, wenn verbucht. */
  readonly zwillingUmsatzId: string;
  readonly zwillingIstId?: string;
  readonly zwillingDatum: string;
  /**
   * Das Konto des Zwillings — IMMER gesetzt, auch wenn es dasselbe ist.
   *
   * Ob daraus ein Hinweis wird, entscheidet die Anzeige durch Vergleich mit dem eigenen
   * Konto der Zeile. Nur-wenn-es-abweicht zu füllen wäre die kürzere Fassung und die
   * schlechtere: das Feld hiesse dann „das Konto des Zwillings, ausser wenn nicht", und
   * am nächsten Randfall liest es jemand als „hat kein Konto".
   */
  readonly zwillingKontoId: string;
}

/**
 * „Diese beiden sind NICHT dasselbe" — von Hand gesetzt und ab dann verbindlich.
 *
 * Der Finder rechnet mit Punkten und liegt manchmal daneben: zwei Einkäufe beim selben
 * Händler über denselben Betrag an aufeinanderfolgenden Tagen sehen aus wie eine Zahlung,
 * deren Buchungstag gerutscht ist. Aus den Daten allein ist das nicht zu entscheiden — aus
 * dem Kopf desjenigen, der eingekauft hat, schon. Diese Entscheidung gehört festgehalten,
 * sonst steht die Mahnung morgen wieder da.
 *
 * Festgehalten wird das PAAR, nicht die Buchung: dass A nicht dasselbe ist wie B, sagt
 * nichts darüber, ob A vielleicht dasselbe ist wie C.
 */
export interface Dublettenfreigabe {
  /** Die beiden Umsätze, aufsteigend sortiert — die Reihenfolge trägt keine Bedeutung. */
  readonly umsatzA: string;
  readonly umsatzB: string;
  readonly angelegt: string; // ISO-Zeitpunkt
}

/** Der richtungslose Schlüssel eines Paares. */
export function freigabeSchluessel(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Die Freigaben als Schlüsselmenge — so fragt sich schneller danach. */
export function freigegebenePaare(freigaben: readonly Dublettenfreigabe[]): Set<string> {
  return new Set(freigaben.map((f) => freigabeSchluessel(f.umsatzA, f.umsatzB)));
}

/** Legt eine Freigabe an — kanonisch sortiert, damit sie in beide Richtungen greift. */
export function freigabeAus(a: string, b: string, jetzt: string): Dublettenfreigabe {
  const [umsatzA, umsatzB] = a < b ? [a, b] : [b, a];
  return { umsatzA, umsatzB, angelegt: jetzt };
}

/**
 * Steht dieselbe Zahlung zweimal im Saldo? Je Konto getrennt geprüft, der Befund wird
 * BEIDEN Seiten angeschrieben.
 *
 * Je Konto, weil zwei gleiche Beträge auf verschiedenen Konten nie dieselbe Buchung sind
 * — und weil es die Vergleiche kleinhält.
 */
export function ledgerVerdacht(
  umsaetze: readonly Umsatz[],
  gebuchteIds: ReadonlySet<string>,
  freigegeben: ReadonlySet<string> = new Set(),
): Map<string, Dublettenverdacht> {
  const jeKonto = new Map<string, Umsatz[]>();
  const verbuchte: Umsatz[] = [];
  for (const u of umsaetze) {
    if (!u.istbuchungId || u.status !== "verbucht") continue;
    // Und die Buchung muss es WIRKLICH noch geben. Ein Umsatz kann „verbucht" heißen und
    // auf eine gelöschte Zeile zeigen — dann steht im Ledger nichts Doppeltes mehr, und
    // ein Verdacht wäre schlicht falsch. Am echten Bestand traf das 32 Zeilen: genau die
    // Dubletten, die schon von Hand entfernt worden waren, wurden weiter angemahnt.
    if (!gebuchteIds.has(u.istbuchungId)) continue;
    verbuchte.push(u);
    const liste = jeKonto.get(u.zahlungskontoId);
    if (liste) liste.push(u);
    else jeKonto.set(u.zahlungskontoId, [u]);
  }

  const raus = new Map<string, Dublettenverdacht>();
  for (const gruppe of jeKonto.values()) {
    for (const paar of paareImBestand(gruppe)) {
      // NUR über Lauf-Grenzen hinweg. Innerhalb EINES Laufs hat die Dublettenprüfung
      // beim Import schon über genau diese Menge entschieden und beide durchgelassen —
      // sie hier erneut anzuzweifeln hiesse, eine getroffene Entscheidung zu übergehen.
      //
      // Am echten Bestand ist der Unterschied nicht theoretisch: die MEHRHEIT aller Paare
      // lag im selben Lauf, und die waren durchweg echte Mehrfachzahlungen — derselbe
      // Übertrag mehrmals an einem Tag, zweimal derselbe Anbieter, oder zwei Zahlungen,
      // die sich erst in der Referenznummer unterscheiden (der Finder vergleicht den
      // Zweck-ANFANG und sieht den Unterschied nicht).
      //
      // Was übrig bleibt, ist genau der Fall, für den die Markierung gedacht ist: dieselbe
      // Zahlung aus zwei Quellen oder aus zwei überlappenden Abrufen.
      if (paar.a.laufId === paar.b.laufId) continue;
      if (freigegeben.has(freigabeSchluessel(paar.a.id, paar.b.id))) continue;
      // Der stärkste Fund je Buchung gewinnt — `paareImBestand` liefert absteigend.
      merke(raus, paar.a.istbuchungId!, paar.b, paar.bewertung);
      merke(raus, paar.b.istbuchungId!, paar.a, paar.bewertung);
    }
  }

  // Und ZULETZT der Blick über die Kontogrenze. Zuletzt, weil `merke` den ersten Fund
  // stehen lässt: liegt dieselbe Zahlung zweimal auf DEMSELBEN Konto, ist das die
  // dringendere Auskunft — dort stimmt der Saldo des Kontos nicht, hier nur die Summe
  // darüber. Beides an eine Zeile zu schreiben ginge nicht; `Dublettenverdacht` trägt
  // genau einen Zwilling, weil eine Zeile in der Liste genau eine Pille trägt.
  const jeQuellzeile = quellzeilenIndex(verbuchte);
  for (const u of verbuchte) {
    const zwilling = fremdkontoZwilling(u, jeQuellzeile, freigegeben);
    if (zwilling) merke(raus, u.istbuchungId!, zwilling, BEWERTUNG_FREMDKONTO);
  }
  return raus;
}

function merke(
  ziel: Map<string, Dublettenverdacht>,
  istId: string,
  zwilling: Umsatz,
  bewertung: Bewertung,
): void {
  if (ziel.has(istId)) return;
  ziel.set(istId, verdachtAus(bewertung, zwilling));
}

function verdachtAus(bewertung: Bewertung, zwilling: Umsatz): Dublettenverdacht {
  return {
    urteil: bewertung.urteil,
    punkte: bewertung.punkte,
    gruende: bewertung.gruende,
    zwillingUmsatzId: zwilling.id,
    zwillingIstId: zwilling.istbuchungId,
    zwillingDatum: zwilling.buchungstag,
    zwillingKontoId: zwilling.zahlungskontoId,
  };
}

// ── Die dritte Frage: dieselbe Quellzeile auf zwei Konten ────────────────────────────
//
// Warum das eine eigene Frage ist und keine Erweiterung der beiden oben: die zwei rechnen
// mit ÄHNLICHKEIT, und für die ist die Kontogrenze eine Vorbedingung — zwei gleiche
// Beträge auf zwei Konten sind nie dieselbe Buchung, und ohne die Grenze fiele die halbe
// Haushaltskasse zusammen. Diese hier rechnet gar nicht: die Quelle hat ihre eigene Zeile
// benannt, es ist dieselbe Zeile, Punkt. Ein harter Schlüssel darf über die Grenze sehen,
// eine Schätzung nicht.
//
// Der Anlass steht in `import/umsaetzeUebernehmen.ts`: der Import hat diese Prüfung bis
// zum 07.09.2026 selbst gemacht und den Fund STILL verschluckt — die Zeile wurde nicht
// angelegt, und auf dem gemeinten Konto stand nichts. Jetzt legt er sie an, und der Fund
// wird hier sichtbar. Das ist die Arbeitsteilung, die überall in dieser Datei gilt:
// **anlegen tut der Import, urteilen tut das Hinsehen.**

/** Was an einem solchen Fund steht — er ist keine Schätzung, deshalb `identisch`. */
const BEWERTUNG_FREMDKONTO: Bewertung = {
  urteil: "identisch",
  punkte: PUNKTE_SICHER,
  gruende: ["dieselbe Buchungs-ID der Quelle, auf einem anderen Konto"],
};

/**
 * Die Schlüssel, unter denen die Quellen einer Zahlung ihre eigenen Zeilen benennen.
 *
 * Aus den BELEGEN und nicht aus `Umsatz.nativeId`: dort steht die Kennung des stärksten
 * Belegs, und zu welcher Quelle sie gehört, sieht man ihr nicht an. Zwei Quellen dürfen
 * dieselbe Zeichenkette vergeben, ohne dieselbe Zeile zu meinen.
 *
 * Eine Zahlung ohne Belege liefert nichts — und das ist die richtige Antwort, nicht eine
 * fehlende: aus der Persistenz kommt die Belegliste immer, von Hand gebaut (Tests, Seed)
 * gibt es nichts zu behaupten.
 */
function quellzeilen(u: Umsatz): string[] {
  const raus: string[] = [];
  for (const b of u.belege ?? []) if (b.nativeId) raus.push(belegSchluessel(b.quelle, b.nativeId));
  return raus;
}

/** Quellschlüssel → die Zahlungen, die ihn tragen. Einmal bauen, oft fragen. */
export function quellzeilenIndex(umsaetze: readonly Umsatz[]): Map<string, Umsatz[]> {
  const raus = new Map<string, Umsatz[]>();
  for (const u of umsaetze) {
    for (const s of quellzeilen(u)) {
      const liste = raus.get(s);
      if (liste) liste.push(u);
      else raus.set(s, [u]);
    }
  }
  return raus;
}

/**
 * Dieselbe Quellzeile auf einem ANDEREN Konto — oder nichts.
 *
 * Gleiches Konto ist hier kein Treffer, sondern die Zuständigkeit der beiden Fragen oben.
 * Bei mehreren Kandidaten gewinnt der erste im Index; welcher das ist, hängt an der
 * Reihenfolge der Eingabe und ist damit beliebig, aber nicht zufällig — dieselbe Liste
 * ergibt morgen denselben Zwilling.
 */
export function fremdkontoZwilling(
  u: Umsatz,
  index: ReadonlyMap<string, Umsatz[]>,
  freigegeben: ReadonlySet<string> = new Set(),
): Umsatz | undefined {
  for (const s of quellzeilen(u)) {
    for (const k of index.get(s) ?? []) {
      if (k.id === u.id || k.zahlungskontoId === u.zahlungskontoId) continue;
      if (freigegeben.has(freigabeSchluessel(u.id, k.id))) continue;
      return k;
    }
  }
  return undefined;
}

/**
 * Ist diese noch nicht verbuchte Bankzeile schon bekannt?
 *
 * Verglichen wird gegen alles auf DEMSELBEN Konto — verbucht, offen oder verworfen. Der
 * Finder kostet praktisch nichts (am echten Bestand gemessen: wenige Millisekunden für
 * einen ganzen Abruf), hier ist es eine Zeile gegen den Kontobestand.
 */
export function entwurfVerdacht(
  entwurf: Umsatz,
  umsaetze: readonly Umsatz[],
  freigegeben: ReadonlySet<string> = new Set(),
): Dublettenverdacht | undefined {
  const bestand = umsaetze.filter(
    (u) =>
      u.id !== entwurf.id &&
      u.zahlungskontoId === entwurf.zahlungskontoId &&
      !freigegeben.has(freigabeSchluessel(entwurf.id, u.id)),
  );
  const [treffer] = ordneZu([entwurf], bestand);
  if (treffer?.bestand && treffer.bewertung.urteil !== "verschieden") {
    return verdachtAus(treffer.bewertung, treffer.bestand);
  }
  // Erst wenn auf dem eigenen Konto nichts liegt, der Blick darüber hinaus.
  const zwilling = fremdkontoZwilling(entwurf, quellzeilenIndex(umsaetze), freigegeben);
  return zwilling ? verdachtAus(BEWERTUNG_FREMDKONTO, zwilling) : undefined;
}

/**
 * Derselbe Blick über einen ganzen STAPEL — die Inbox der abgerufenen Zeilen.
 *
 * Der Unterschied zu `entwurfVerdacht` ist die 1:1-Regel aus `ordneZu`: jede Bestandszeile
 * wird höchstens einmal vergeben. Ohne sie zeigten drei gleiche Beträge am selben Tag alle
 * drei auf dieselbe alte Zeile, und zwei echte Buchungen verschwänden aus der Anzeige. Für
 * eine EINZELNE Zeile im Dialog gibt es diese Gefahr nicht — dort gibt es nichts zu
 * verteilen.
 *
 * Freigaben werden hier NACH der Zuordnung abgezogen, nicht vorher: die 1:1-Vergabe
 * rechnet über den ganzen Stapel, und ein Bestandssatz, der für ein freigegebenes Paar
 * verbraucht wurde, bleibt verbraucht. Der Fall ist selten (er braucht drei gleiche
 * Beträge, von denen zwei freigegeben sind) und die Folge harmlos: eine Zeile weniger
 * angemahnt.
 */
export function stapelVerdacht(
  neue: readonly Umsatz[],
  bestand: readonly Umsatz[],
  freigegeben: ReadonlySet<string> = new Set(),
): Map<string, Dublettenverdacht> {
  const raus = new Map<string, Dublettenverdacht>();
  ordneZu(neue, bestand).forEach((treffer, i) => {
    if (!treffer.bestand || treffer.bewertung.urteil === "verschieden") return;
    if (freigegeben.has(freigabeSchluessel(neue[i].id, treffer.bestand.id))) return;
    raus.set(neue[i].id, verdachtAus(treffer.bewertung, treffer.bestand));
  });
  // Wieder zuletzt und wieder aus demselben Grund wie in `ledgerVerdacht`: was auf dem
  // eigenen Konto schon gefunden wurde, bleibt stehen.
  const jeQuellzeile = quellzeilenIndex(bestand);
  for (const n of neue) {
    if (raus.has(n.id)) continue;
    const zwilling = fremdkontoZwilling(n, jeQuellzeile, freigegeben);
    if (zwilling) raus.set(n.id, verdachtAus(BEWERTUNG_FREMDKONTO, zwilling));
  }
  return raus;
}
