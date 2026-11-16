// Ergebnisrechnung — was ein Monat KOSTET, nicht was in ihm vom Konto ging.
//
// Die Begriffe und Regeln stehen in `core/CLAUDE.md` unter „Auszahlung und Kosten"; hier
// steht ihre Umsetzung. Die Rechnung liegt in der Wurzel des Kerns, weil sie über alle
// Bereiche rechnet — Buchungen, Verträge, Budgets, Rücklagen, Konten.
//
// Sie baut auf der Einordnung (`einordnung.ts`) und sortiert selbst nichts. Was sie
// hinzufügt, ist die ZEIT:
//
//   • Fixkosten werden PERIODISIERT. Ein Jahresbeitrag kostet zwölf Monate lang ein
//     Zwölftel, ab dem Monat seiner Zahlung (vorschüssig).
//   • Eine RÜCKLAGE kostet ihre Rate. Was aus ihr bezahlt wird, ist eine Entnahme und
//     zählt nicht noch einmal — ausser sie reicht nicht (`zyklusKosten`, die max-Regel je
//     Zyklus). Nur ein Zyklus, der vor der Umstellung mit einer verknüpften Buchung
//     ausgebucht wurde, rechnet nach der alten Regel (`altabschlussKosten`).
//   • Ein VORSORGEZIEL kostet die Sparrate, die es verlangt (`vorsorgerateIm`). Was
//     tatsächlich in die Vorsorge überwiesen wurde, ist die Zuführung und steht in der
//     Überleitung, nicht in den Kosten. Ohne Ziel zählt die Überweisung selbst.
//   • Eine KREDITRATE wird geteilt, wenn eine Schuld auf ihren Vertrag verweist: die
//     Zinsen bleiben unter den Verträgen, die TILGUNG steht in der dritten Stufe
//     (`tilgungAbspalten`). Die Tilgung kommt aus der Reihe der Restschulden
//     (`vermoegen/tilgung.ts`), nicht aus einem Plan.
//
// Darunter steht die ÜBERLEITUNG: sie führt vom Ergebnis zur Änderung der Kontostände
// und muss exakt auf die Summe der Buchungen ohne Gegenbein aufgehen. Das ist keine
// Zierde, sondern die Probe — eine Kostenrechnung, die sich nicht auf die Bank
// zurückführen lässt, ist eine Behauptung.
//
// Drei Stufen, Pflichten zuerst:
//
//     Einnahmen − Fixkosten                       = nach den Pflichten
//     − laufende Kosten − Ungeplantes             = was der Alltag übrig lässt
//     − Rücklagen − Vorsorge − Tilgung            = Ergebnis
//
// „Rücklagen" ist EINE Zeile (seit 2026-11-15) für jede Rücklage — seit Migration 81 auch
// die früheren aufbauenden Budgets, die jetzt Rücklagen der Sorte `fortlaufend` sind. Alle
// rechnen über dieselben Bausteine (`ruecklagen/topf.ts`). Die Posten: einer je laufender
// Rücklage und einer je abgeschlossenem Zyklus —
// zusammengeführt HIER, damit Monatskarten, Kostensicht, Bericht, Reichweite und
// Kennzahlen dieselbe Zeile lesen und keine Sicht selbst addiert. Die Zeilen-ID bleibt
// `abschreibungen`.
//
// Die Tilgung steht unten und nicht als blosse Verwendung des Überschusses — aus
// demselben Grund wie die Vorsorge (`core/CLAUDE.md`): sonst sähe ein Monat, in dem
// nichts getilgt wurde, besser aus. „Bleibt wirklich frei" ändert sich durch die Teilung
// nicht; ehrlicher werden die beiden Zwischensummen davor, die eine Kreditrate bis dahin
// ganz als Pflicht führten, obwohl ein Teil davon Vermögen aufbaut.
//
// WAS HIER NOCH NICHT GILT, und wer es ändert, ändert es hier:
//
//   • Einnahmen werden nicht periodisiert — ein Jahresbonus steht in seinem Monat.
//   • Ohne Vorsorgeziel — und in Monaten, für die es keine Rate verlangt (vor seiner
//     ersten Annahme, ab dem Zielmonat) — zählt die Vorsorge mit dem, was tatsächlich
//     umgebucht wurde. Das ist kein Ersatz für die Rate, sondern das einzige, was dann
//     bekannt ist.
//   • Der Kauf aus einer RÜCKLAGE wird nur gegen ihren Stand geprüft, wenn die
//     Ausbuchung ihren Zyklus kennt (seit Migration 76). Bei älteren ist der Stand
//     von damals nicht mehr zu rechnen; ihr Kauf gilt als gedeckt.
//   • Zwei bekannte Befunde werden bewusst NACHGEBILDET und nicht behoben (Teil B des
//     Entwurfs zu ADR-0006): eine Kategoriebuchung VOR dem Beginn einer fortlaufenden
//     Rücklage (früher: dem Start eines aufbauenden Budgets) ist eine Entnahme und kostet
//     nichts; ein Kauf, den zwei Ausbuchungen nennen,
//     zählt in beiden als ungedeckt. Beides hält `ergebnis.test.ts` fest.

import type { Cent } from "./basis/geld";
import { addMonate, addTage, monateZwischen, parseIso, toIso } from "./basis/datum";
import { RHYTHMUS_MONATE, type Zahlungsregel } from "./basis/zahlungsregel";
import type { IstBuchung } from "./buchung/istbuchung";
import { projiziereRegel } from "./buchung/projektion";
import { zufuehrungIm, type Budget } from "./budgets/budget";
import { einordnen, type Einordnung, type Einordnungskontext } from "./einordnung";
import type { Kategorie } from "./kategorien/kategorie";
import { istVorsorgekonto, type Zahlungskonto } from "./konten/konto";
import type { Ruecklage, Ruecklagenzyklus } from "./ruecklagen/ruecklage";
import { entnahmeIm, ruecklagenart, zyklenpostenIm, type Ruecklagenentnahme, type Zyklusposten } from "./ruecklagen/topf";
import type { Ruecklagenzuordnung } from "./ruecklagen/zuordnung";
import { tilgungIm } from "./vermoegen/tilgung";
import { wirdGefuehrt, type VermoegensEingabe } from "./vermoegen/vermoegen";
import { annahmeIm, vorsorgestand, vorsorgevermoegen, type Vorsorgezielannahme } from "./vorsorge/vorsorge";

export type ErgebnisZeileId =
  | "einnahmen"
  | "fixkosten"
  | "laufend"
  | "ungeplant"
  | "abschreibungen"
  | "vorsorge"
  | "tilgung";

export type PostenStand = "gebucht" | "offen" | "ohnePlan";

export interface ErgebnisPosten {
  /** Stabil innerhalb eines Monats. */
  readonly schluessel: string;
  /** Name der Regel bzw. Rücklage; bei Budgets leer — die Oberfläche löst `kategorieId` auf. */
  readonly bezeichnung: string;
  readonly datum?: string;
  /** Geplante Kosten, vorzeichenbehaftet (Kosten negativ). */
  readonly plan: Cent;
  /** Tatsächliche Kosten; `null` in einem künftigen Monat. */
  readonly ist: Cent | null;
  readonly status: PostenStand;
  /** Die Buchung dahinter, wenn es genau eine ist. */
  readonly istId?: string;
  readonly kategorieId?: string;
  readonly vertragId?: string;
  readonly budgetId?: string;
  readonly ruecklageId?: string;
  /** Bei der Tilgung: die Schuld, deren Restschuld sinkt. */
  readonly verbindlichkeitId?: string;
  /**
   * Bei einem Vertrag, über den eine Schuld läuft: der Posten zeigt nur noch die ZINSEN,
   * weil die Tilgung abgespalten wurde und in ihrer eigenen Zeile steht.
   */
  readonly nurZinsen?: true;
  /** Über wie viele Monate die Zahlung verteilt ist — nur gesetzt, wenn mehr als einer. */
  readonly teile?: number;
  /**
   * Bei einem Topf: was im Monat aus ihm BEZAHLT wurde, vorzeichenbehaftet. Das ist die
   * Auszahlung, nicht die Kosten — sie steht in der Überleitung.
   */
  readonly entnahme?: Cent;
  /**
   * Beim Vorsorgeziel: was im Monat tatsächlich in die Vorsorge ging, vorzeichenbehaftet
   * wie die Buchungen (abgehend negativ). Die Kosten sind die Rate; das hier ist die
   * Gegenseite auf dem Konto, und ob beides übereinstimmt, ist genau die Frage, die
   * jemand an dieser Zeile hat.
   */
  readonly zufuehrung?: Cent;
}

export interface ErgebnisZeile {
  readonly id: ErgebnisZeileId;
  readonly plan: Cent;
  readonly ist: Cent | null;
  readonly posten: readonly ErgebnisPosten[];
}

export interface Stufe {
  readonly plan: Cent;
  readonly ist: Cent | null;
}

export type UeberleitungId = "raten" | "entnahmen" | "periodisierung" | "zufuehrung" | "vorsorgeEigen";

/**
 * Vom Ergebnis zur Änderung der Kontostände.
 *
 *   raten          + Raten der Töpfe, Rücklagen und des Vorsorgeziels: Kosten, aber
 *                    nicht abgeflossen
 *   entnahmen      − was aus Töpfen und Rücklagen bezahlt wurde: abgeflossen, keine Kosten
 *   periodisierung ± Fixkosten: bezahlt minus auf den Monat entfallend
 *   zufuehrung     − was in die Vorsorge ging, solange ein Ziel die Rate stellt:
 *                    abgeflossen, aber nicht die Kosten (die waren die Rate)
 *   vorsorgeEigen  + Vorsorge auf eigenen Konten: zählt oben (als Kosten oder als
 *                    Zuführung), ist aber weiter eigenes Geld
 */
export interface Ueberleitung {
  readonly ergebnis: Cent;
  readonly posten: readonly { readonly id: UeberleitungId; readonly betrag: Cent }[];
  /** Σ aller Buchungen des Monats ohne Gegenbein — die Änderung aller Kontostände zusammen. */
  readonly kontoaenderung: Cent;
}

export interface MonatsErgebnis {
  readonly jahr: number;
  readonly monat: number;
  /** „YYYY-MM". */
  readonly label: string;
  readonly von: string;
  /** Exklusiv. */
  readonly bis: string;
  readonly laufend: boolean;
  readonly zukunft: boolean;
  readonly zeilen: readonly ErgebnisZeile[];
  readonly nachPflichten: Stufe;
  readonly nachAlltag: Stufe;
  readonly ergebnis: Stufe;
  /** Fehlt in einem künftigen Monat: wo nichts gebucht ist, gibt es nichts überzuleiten. */
  readonly ueberleitung?: Ueberleitung;
  /**
   * Womit der LAUFENDE Monat voraussichtlich endet (`hochrechnung`). Nur dort gesetzt:
   * ein vergangener Monat ist sein Ist, ein künftiger sein Plan — eine dritte Zahl
   * daneben sagte in beiden Fällen nichts Neues.
   */
  readonly erwartet?: Cent;
}

export interface ErgebnisEingabe {
  readonly regeln: readonly Zahlungsregel[];
  readonly budgets: readonly Budget[];
  /** Die laufenden Rücklagen (`RuecklagenRepository.alle()`). */
  readonly ruecklagen: readonly Ruecklage[];
  /**
   * Die beendeten (`RuecklagenRepository.beendete()`) — über einen eigenen Weg, wie im
   * Repository. Eine beendete Rücklage trägt ihre Kategorie bis zu ihrem Ende, und ihre
   * Ausbuchungen haben Monate gekostet. Fehlt die Angabe, rechnen ihre Ausbuchungen
   * trotzdem (aus dem, was sie festhalten); nur finden kann sie dann nichts.
   */
  readonly beendete?: readonly Ruecklage[];
  /**
   * Die Ausbuchungen — jede hält den Zyklus fest, den sie beendet hat (seit Migration
   * 76). Aus ihnen kommen die Raten vergangener Monate und die Prüfung, ob ein Kauf vom
   * Angesparten gedeckt war.
   */
  readonly ausbuchungen: readonly Ruecklagenzyklus[];
  /**
   * Die ausdrücklichen Zuordnungen zu einer Rücklage (`ruecklage_zuordnung`). Pflicht: eine
   * leere Liste ist eine Aussage und wird hingeschrieben.
   */
  readonly ruecklagenzuordnungen: readonly Ruecklagenzuordnung[];
  /** ALLE Buchungen aller Konten — Kosten hängen nicht daran, von wo bezahlt wurde. */
  readonly ist: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  readonly konten: readonly Zahlungskonto[];
  /** Buchungs-ID → Vertrags-ID (siehe `Einordnungskontext`). */
  readonly vertragJeBuchung: ReadonlyMap<string, string>;
  /** Heutiges Datum (ISO) — trennt Plan von Plan und Ist. */
  readonly heute: string;
  /** Das Vorsorgeziel, falls eines angelegt ist. Fehlt es, zählt die tatsächliche Umbuchung. */
  readonly vorsorge?: ErgebnisVorsorge;
  /**
   * Die Schulden mit ihren Restschulden — gebraucht wird nur, was auf einen Vertrag
   * verweist. Fehlt die Angabe, rechnet jede Kreditrate ganz als Kosten des Vertrags.
   */
  readonly schulden?: ErgebnisSchulden;
}

/** Was die Ergebnisrechnung von den Schulden braucht — derselbe Bestand wie im Bereich Vermögen. */
export type ErgebnisSchulden = Pick<VermoegensEingabe, "verbindlichkeiten" | "staende">;

/**
 * Was die Ergebnisrechnung über das Vorsorgeziel wissen muss, um seine Rate für JEDEN
 * Monat selbst zu rechnen.
 *
 * Die Bausteine und nicht eine fertige Rate je Monat: die Rate hängt am Monat (welche
 * Annahme gilt, wie viel zu seinem Anfang da war), und die Ergebnisrechnung entscheidet,
 * welche Monate sie rechnet. Eine Funktion von aussen wäre eine Regel, die der Kern nicht
 * sieht; eine Liste fertiger Raten müsste jeder Aufrufer für genau die richtigen Monate
 * bauen. So rechnet die Rate an genau einer Stelle (`vorsorgerateIm`), mit derselben
 * Kette wie die Karte im Bereich Vermögen.
 */
export interface ErgebnisVorsorge {
  readonly zielId: string;
  readonly bezeichnung: string;
  /** Die Reihe der Annahmen dieses Ziels (`annahmeIm` wählt je Monat). */
  readonly annahmen: readonly Vorsorgezielannahme[];
  /** Der Bestand, über den `vorsorgevermoegen` rechnet — dieselbe Auswahl wie im Bereich Vermögen. */
  readonly bestand: Pick<VermoegensEingabe, "konten" | "buchungen" | "depotwerte" | "gegenstaende" | "werte">;
}

/**
 * Was das Vorsorgeziel im Monat `monat` („YYYY-MM") kostet, POSITIV — oder `undefined`,
 * wenn es in diesem Monat keine Rate verlangt.
 *
 * Gerechnet wird ZUM MONATSANFANG: mit der Annahme, die in dem Monat gilt, und dem
 * Vorsorgevermögen am letzten Tag des Vormonats. Zwei Gründe:
 *
 *   • Die Rate eines vergangenen Monats darf sich nicht ändern, nur weil heute mehr da
 *     ist. Mit dem Vermögen von heute stünde jeder Rückblick nach jeder Überweisung
 *     anders da.
 *   • Der Vormonat und nicht der Erste selbst: sonst senkte eine Überweisung am Ersten
 *     die Rate desselben Monats, und wer früh im Monat spart, hätte weniger gekostet als
 *     wer es am Monatsende tut.
 *
 * Keine Rate (`undefined`) gibt es in drei Fällen, und alle drei rechnen wie ohne Ziel —
 * die tatsächliche Umbuchung zählt:
 *
 *   • VOR der ersten Annahme. Ein Ziel, das im März angelegt wurde, hat im Januar nichts
 *     verlangt (`annahmeIm`).
 *   • AB dem Zielmonat. Dann wird entnommen, nicht angespart; eine Rate über null
 *     verbleibende Monate gibt es nicht.
 *   • Wenn das Ziel nicht mehr erreichbar ist (`sparrate === null`). Das tritt nur am
 *     Zielmonat auf und fällt damit in den Fall davor. Eine erfundene Rate an dieser
 *     Stelle wäre eine Behauptung, und null als Rate machte jede tatsächliche Überweisung
 *     kostenlos.
 *
 * Eine Rate von NULL ist dagegen eine Aussage: das Ziel ist gedeckt und verlangt nichts.
 * Dann kostet die Vorsorge den Monat nichts, und was trotzdem überwiesen wird, steht nur
 * in der Überleitung — Überschuss, der zufällig im Depot liegt.
 */
export function vorsorgerateIm(v: ErgebnisVorsorge, monat: string): Cent | undefined {
  const annahme = annahmeIm(
    v.annahmen.filter((a) => a.zielId === v.zielId),
    monat,
  );
  if (!annahme) return undefined;
  const monatsanfang = `${monat}-01`;
  const vortag = toIso(addTage(parseIso(monatsanfang), -1));
  const vermoegen = vorsorgevermoegen(v.bestand, v.zielId, vortag).netto;
  const stand = vorsorgestand(annahme, vermoegen, monatsanfang);
  if (stand.monateBisZiel <= 0 || stand.sparrate == null) return undefined;
  return stand.sparrate;
}

/**
 * Die Vorarbeit, die für jeden Monat dieselbe ist: der eingeordnete Bestand.
 *
 * Getrennt herausgegeben, damit eine Auswertung über viele Monate (Analyse) nicht für
 * jeden Monat neu einordnet — und damit andere Sichten dieselbe Einordnung lesen können,
 * statt eine zweite zu bauen.
 */
export interface Ergebnisbasis {
  readonly eingabe: ErgebnisEingabe;
  readonly vorsorgeKonten: ReadonlySet<string>;
  readonly einordnungen: readonly Einordnung[];
  /** Je Rücklage die Anteile, die sie trägt. */
  readonly entnahmen: ReadonlyMap<string, readonly Ruecklagenentnahme[]>;
  /**
   * Buchungs-ID → Kauf, für die Käufe, die eine alte Ausbuchung nennt und die die
   * Einordnung als Entnahme führt. Der Betrag ist der der ganzen Buchung — so hat die
   * Ergebnisrechnung ihn vor der Umstellung gegen das Angesparte gestellt.
   */
  readonly altkaeufe: ReadonlyMap<string, Ruecklagenentnahme>;
}

export function einordnungskontext(
  e: Pick<ErgebnisEingabe, "kategorien" | "budgets" | "konten" | "vertragJeBuchung" | "ausbuchungen" | "ruecklagen" | "beendete" | "ruecklagenzuordnungen">,
): Einordnungskontext {
  return {
    kategorien: e.kategorien,
    budgets: e.budgets,
    vertragJeBuchung: e.vertragJeBuchung,
    vorsorgeKonten: new Set(e.konten.filter(istVorsorgekonto).map((k) => k.id)),
    ruecklagen: [...e.ruecklagen, ...(e.beendete ?? [])],
    ruecklagenzuordnungen: e.ruecklagenzuordnungen,
    ausbuchungen: e.ausbuchungen,
  };
}

export function ergebnisbasis(eingabe: ErgebnisEingabe): Ergebnisbasis {
  const kontext = einordnungskontext(eingabe);
  const einordnungen = einordnen(eingabe.ist, kontext);
  return {
    eingabe,
    vorsorgeKonten: kontext.vorsorgeKonten,
    einordnungen,
    entnahmen: ruecklagenEntnahmen(einordnungen),
    altkaeufe: new Map(
      einordnungen
        .filter((x) => x.ausgebucht)
        .map((x) => [x.buchung.id, { datum: x.buchung.datum, betrag: x.buchung.betrag }]),
    ),
  };
}

/**
 * Je Rücklage die Anteile, die sie trägt — vorzeichenbehaftet wie die Buchung. Die
 * Grundlage jeder Rechnung über ihren Stand: Kosten, Anspruch auf dem Konto, Deckung.
 * Entnahmen über eine alte Ausbuchung gehören nicht dazu; die rechnen nach der alten
 * Regel (`altabschlussKosten`).
 */
export function ruecklagenEntnahmen(einordnungen: readonly Einordnung[]): Map<string, Ruecklagenentnahme[]> {
  const raus = new Map<string, Ruecklagenentnahme[]>();
  for (const x of einordnungen) {
    if (x.art !== "ruecklage" || !x.ruecklageId) continue;
    const e = { datum: x.buchung.datum, betrag: x.betrag };
    const liste = raus.get(x.ruecklageId);
    if (liste) liste.push(e);
    else raus.set(x.ruecklageId, [e]);
  }
  return raus;
}

/**
 * Die Posten der Zeile „Rücklagen" — in der Reihenfolge, in der sie vor der Umstellung
 * entstanden: die abgeschlossenen Zyklen (je Ausbuchung), die fortlaufenden Rücklagen
 * (bis Migration 81 die aufbauenden Budgets), die abschliessenden.
 *
 *   • Ein abgeschlossener Zyklus mit Geschichte kostet je Monat, was seine Regel sagt —
 *     die alte, wenn eine Ausbuchung mit verknüpfter Buchung ihn abgeschlossen hat, sonst
 *     die max-Regel. Ohne Geschichte bildet er keinen Posten: ihr Kauf gilt wie zuvor
 *     als gedeckt. In einem künftigen Monat gibt es diese Posten nicht.
 *   • Eine laufende Rücklage kostet ihre Rate und, wenn sie ihre Ausgaben über die
 *     Kategorie findet und überzogen wird, das Ungedeckte dazu.
 */
function ruecklagenposten(basis: Ergebnisbasis, monat: string, von: string, bis: string, zukunft: boolean): ErgebnisPosten[] {
  const e = basis.eingabe;
  const imMonat = (x: Einordnung) => x.buchung.datum >= von && x.buchung.datum < bis;
  const entnahmenVon = (id: string) => basis.entnahmen.get(id) ?? [];

  // Je Rücklage EINMAL die Zyklen gerechnet; die Posten der abgeschlossenen werden über
  // ihre Ausbuchung gefunden. Eine Ausbuchung, deren Rücklage hier fehlt, rechnet aus
  // dem, was sie festhält.
  const bekannt = new Map<string, Ruecklage>();
  for (const r of [...e.ruecklagen, ...(e.beendete ?? [])]) bekannt.set(r.id, r);
  for (const a of e.ausbuchungen) {
    if (!bekannt.has(a.ruecklageId)) {
      bekannt.set(a.ruecklageId, { id: a.ruecklageId, bezeichnung: a.bezeichnung ?? "", beginn: a.datum, beendetAm: a.datum });
    }
  }
  const jeAbschluss = new Map<string, Zyklusposten>();
  const laufend = new Map<string, Zyklusposten>();
  for (const r of bekannt.values()) {
    for (const p of zyklenpostenIm(r, e.ausbuchungen, entnahmenVon(r.id), monat, basis.altkaeufe)) {
      if (p.zyklus.abschlussId) jeAbschluss.set(p.zyklus.abschlussId, p);
      else laufend.set(r.id, p);
    }
  }

  const zyklusPosten = zukunft
    ? []
    : e.ausbuchungen.flatMap((a): ErgebnisPosten[] => {
        const p = jeAbschluss.get(a.id);
        if (!p || !p.zyklus.beginn) return [];
        const alt = !!p.zyklus.istbuchungId;
        const kauf = alt ? basis.altkaeufe.get(p.zyklus.istbuchungId as string) : undefined;
        // Bei der alten Regel ist die Entnahme der Kauf selbst, wenn er in den Monat fällt
        // — als Ausgabe; eine Rückbuchung darauf deckt nichts auf.
        const entnahme = alt
          ? kauf && kauf.datum >= von && kauf.datum < bis ? -Math.max(0, -kauf.betrag) || 0 : undefined
          : entnahmeIm(p.zyklus, entnahmenVon(a.ruecklageId), monat);
        if (p.rate === 0 && p.kosten === 0 && !entnahme) return [];
        return [{
          schluessel: `zyklus:${a.id}`,
          bezeichnung: a.bezeichnung ?? "",
          ruecklageId: a.ruecklageId,
          kategorieId: a.kategorieId,
          plan: -p.rate || 0,
          ist: -p.kosten || 0,
          status: "gebucht",
          entnahme,
        }];
      });

  // Die fortlaufenden vor den abschliessenden — so standen sie vor Migration 81 (damals als
  // aufbauende Budgets), und bei gleicher Rate entscheidet die Reihenfolge die Anzeige.
  // Ihre Entnahme ist ALLES, was sie im Monat getragen hat, auch vor ihrem Beginn: so
  // zeigte der Posten des aufbauenden Budgets den bekannten Befund (eine Kategoriebuchung
  // vor dem Start ist eine Entnahme, die nichts kostet), und er wird nachgebildet.
  const fortlaufendePosten = e.ruecklagen
    .filter((r) => ruecklagenart(r) === "fortlaufend")
    .map((r): ErgebnisPosten => {
      const p = laufend.get(r.id);
      const entnahme = summe(
        basis.einordnungen.filter((x) => x.art === "ruecklage" && x.ruecklageId === r.id && imMonat(x)).map((x) => x.betrag),
      );
      return {
        schluessel: `ruecklage:${r.id}`,
        bezeichnung: r.bezeichnung,
        ruecklageId: r.id,
        kategorieId: r.kategorieId,
        plan: -(p?.rate ?? 0) || 0,
        ist: zukunft ? null : -(p?.kosten ?? 0) || 0,
        status: zukunft ? "offen" : "gebucht",
        entnahme: zukunft ? undefined : entnahme,
      };
    })
    .filter((p) => p.plan !== 0 || (p.ist ?? 0) !== 0 || (p.entnahme ?? 0) !== 0);

  const laufendePosten = e.ruecklagen
    .filter((r) => ruecklagenart(r) !== "fortlaufend")
    .map((r): ErgebnisPosten => {
      const p = laufend.get(r.id);
      // Die Rate und nicht die blosse Monatsrate: vor dem Beginn steht nichts, und eine
      // Rücklage, deren Ziel erreicht ist, kostet nichts mehr — bis sie abgeschlossen
      // wird und von vorn anfängt.
      const plan = -(p?.rate ?? 0) || 0;
      return {
        schluessel: `ruecklage:${r.id}`,
        bezeichnung: r.bezeichnung,
        ruecklageId: r.id,
        kategorieId: r.kategorieId,
        plan,
        ist: zukunft ? null : -(p?.kosten ?? 0) || 0,
        status: zukunft ? "offen" : "gebucht",
        entnahme: zukunft || !p ? undefined : entnahmeIm(p.zyklus, entnahmenVon(r.id), monat),
      };
    })
    .filter((p) => p.plan !== 0 || (p.ist ?? 0) !== 0 || (p.entnahme ?? 0) !== 0);

  return [...zyklusPosten, ...fortlaufendePosten, ...laufendePosten].sort((a, b) => a.plan - b.plan);
}

const summe = (werte: readonly Cent[]): Cent => werte.reduce((s, w) => s + w, 0);
const monatVon = (iso: string): string => iso.slice(0, 7);

/**
 * Der Teil einer Zahlung, der auf einen ihrer `teile` Monate entfällt.
 *
 * Der Rest der ganzzahligen Teilung fällt in den ERSTEN Monat (`index` 0, der Monat der
 * Zahlung). So summieren die Teile exakt auf den Betrag — mit gerundeten gleichen Teilen
 * fehlte am Ende ein Cent, und die Überleitung ginge über das Jahr nicht auf.
 */
export function monatsanteil(betrag: Cent, teile: number, index: number): Cent {
  if (teile <= 1) return betrag;
  const basis = Math.trunc(betrag / teile);
  return index === 0 ? betrag - basis * (teile - 1) : basis;
}

/** Die Ergebnisrechnung eines Monats. `monatAb` ist sein erster Tag („YYYY-MM-01"). */
export function monatsErgebnis(basis: Ergebnisbasis, monatAb: string): MonatsErgebnis {
  const e = basis.eingabe;
  const start = parseIso(monatAb);
  const von = toIso({ ...start, d: 1 });
  const bis = toIso(addMonate(start, 1));
  const monat = monatVon(von);
  const zukunft = von > e.heute;
  const laufend = !zukunft && e.heute < bis;

  const imMonat = zukunft ? [] : basis.einordnungen.filter((x) => x.buchung.datum >= von && x.buchung.datum < bis);
  const derArt = (art: Einordnung["art"]) => imMonat.filter((x) => x.art === art);

  const istVorsorgeregel = (r: Zahlungsregel) =>
    r.charakter === "Umschichtung" &&
    (!r.gegenkontoId ||
      (basis.vorsorgeKonten.has(r.gegenkontoId) && !(r.kontoId && basis.vorsorgeKonten.has(r.kontoId))));

  const einnahmen = regelZeile(
    "einnahmen",
    e.regeln.filter((r) => r.charakter === "Ertrag"),
    basis.einordnungen.filter((x) => x.art === "einnahme"),
    { von, zukunft, periodisiert: false },
  );
  const fixkostenGesamt = regelZeile(
    "fixkosten",
    e.regeln.filter((r) => r.charakter === "Aufwand"),
    basis.einordnungen.filter((x) => x.art === "fixkosten"),
    { von, zukunft, periodisiert: true },
  );
  const { fixkosten, tilgung } = tilgungAbspalten(fixkostenGesamt, e.schulden, { monat, von, zukunft });
  // Mit Ziel ersetzt seine Rate die Zeile ganz, auch die Daueraufträge darin: deren
  // Plan neben der Rate stünde zweimal für dasselbe Geld da. Die Überweisungen selbst
  // stehen am Posten (`zufuehrung`) und in der Überleitung.
  const vorsorgerate = e.vorsorge ? vorsorgerateIm(e.vorsorge, monat) : undefined;
  const zugefuehrt = summe(derArt("vorsorge").map((x) => x.betrag));
  const vorsorge =
    vorsorgerate === undefined || !e.vorsorge
      ? regelZeile(
          "vorsorge",
          e.regeln.filter(istVorsorgeregel),
          basis.einordnungen.filter((x) => x.art === "vorsorge"),
          { von, zukunft, periodisiert: false },
        )
      : zeile(
          "vorsorge",
          vorsorgerate === 0 && zugefuehrt === 0
            ? []
            : [{
                schluessel: `vorsorgeziel:${e.vorsorge.zielId}@${von}`,
                bezeichnung: e.vorsorge.bezeichnung,
                plan: -vorsorgerate || 0,
                ist: zukunft ? null : -vorsorgerate || 0,
                // Wie eine Rücklage: die Rate steht mit dem ganzen Monat da, ob schon
                // überwiesen wurde oder nicht — „offen" hiesse, es kommt noch etwas.
                status: zukunft ? "offen" : "gebucht",
                zufuehrung: zukunft ? undefined : zugefuehrt,
              }],
          zukunft,
        );
  const mitZiel = vorsorgerate !== undefined;

  const laufendeKosten = zeile(
    "laufend",
    e.budgets
      .filter((b) => b.art === "monatlich")
      .map((b): ErgebnisPosten => {
        const ist = zukunft ? null : summe(derArt("laufend").filter((x) => x.budgetId === b.id).map((x) => x.betrag));
        return {
          schluessel: b.id,
          bezeichnung: "",
          kategorieId: b.kategorieId,
          budgetId: b.id,
          plan: -zufuehrungIm(b, monat) || 0,
          ist,
          status: ist == null || ist === 0 ? "offen" : "gebucht",
        };
      })
      .filter((p) => p.plan !== 0 || (p.ist ?? 0) !== 0)
      .sort((a, b) => a.plan - b.plan),
    zukunft,
  );

  const abschreibungen = zeile(
    "abschreibungen",
    ruecklagenposten(basis, monat, von, bis, zukunft),
    zukunft,
  );

  const ungeplant = zeile(
    "ungeplant",
    derArt("ungeplant")
      .map((x) => einzelposten(x))
      .sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "")),
    zukunft,
  );

  // Die drei ersten Zeilen stehen immer da: ein Monat ohne Einnahmen, Fixkosten oder
  // Alltag ist eine Aussage. Die übrigen nur, wenn es sie gibt — Zeilen voller Nullen
  // wären bei einem Haushalt ohne Töpfe Lärm.
  const zeilen = [einnahmen, fixkosten, laufendeKosten, ungeplant, abschreibungen, vorsorge, tilgung].filter(
    (z, i) => i < 3 || z.posten.length > 0,
  );

  const stufe = (...teile: readonly ErgebnisZeile[]): Stufe => ({
    plan: summe(teile.map((z) => z.plan)),
    ist: zukunft ? null : summe(teile.map((z) => z.ist ?? 0)),
  });
  const nachPflichten = stufe(einnahmen, fixkosten);
  const nachAlltag = stufe(einnahmen, fixkosten, laufendeKosten, ungeplant);
  const ergebnis = stufe(einnahmen, fixkosten, laufendeKosten, ungeplant, abschreibungen, vorsorge, tilgung);

  return {
    jahr: start.y,
    monat: start.m,
    label: monat,
    von,
    bis,
    laufend,
    zukunft,
    zeilen,
    nachPflichten,
    nachAlltag,
    ergebnis,
    erwartet: laufend ? hochrechnung(zeilen) : undefined,
    ueberleitung: zukunft
      ? undefined
      : ueberleitung(ergebnis.ist ?? 0, {
          raten: -((abschreibungen.ist ?? 0) + (mitZiel ? vorsorge.ist ?? 0 : 0)) || 0,
          entnahmen: summe(derArt("ruecklage").map((x) => x.betrag)),
          // Gegen die Verträge VOR der Teilung: die Tilgung ist mit der Rate vom Konto
          // gegangen, sie ist kein Unterschied zwischen Kosten und Auszahlung.
          periodisierung: summe(derArt("fixkosten").map((x) => x.betrag)) - (fixkostenGesamt.ist ?? 0) || 0,
          // Mit Ziel ist die Überweisung nicht die Kosten, sondern ihre Gegenseite: sie
          // geht vom Konto, steht aber nicht im Ergebnis. Ohne Ziel steht sie schon oben.
          zufuehrung: mitZiel ? zugefuehrt : 0,
          vorsorgeEigen:
            -summe(
              derArt("vorsorge")
                .filter((x) => x.intern)
                .map((x) => x.betrag),
            ) || 0,
        }),
  };
}

/**
 * Teilt die Rate eines Vertrags, über den eine Schuld läuft, in Zinsen und Tilgung.
 *
 * Die Tilgung des Monats kommt aus der Reihe der Restschulden (`tilgungIm`) und wird hier
 * nur noch begrenzt: **nie mehr, als der Vertrag in dem Monat kostet** — für den Plan
 * gegen seinen Plan, für das Ist gegen sein Ist. Eine Sondertilgung senkt die Restschuld,
 * läuft aber nicht über die Rate; ohne die Grenze stünde sie als Tilgung eines Monats da,
 * dessen Zinsen dann negativ wären. Und ein Monat, in dem die Rate (noch) nicht abgebucht
 * ist, hat im Ist nichts zu teilen.
 *
 * Gegen die KOSTEN des Vertrags und nicht gegen seine Zahlung: bei einem periodisierten
 * Vertrag (ein Jahreszahler) kostet jeder Monat ein Zwölftel, und gegen dieses Zwölftel
 * wird die Monatstilgung gestellt. Beides ist gleichmässig über die Monate verteilt, also
 * passt es zusammen.
 *
 * Was abgespalten wird, verschwindet aus den Vertragsposten und steht als eigener Posten
 * in der Zeile „tilgung". Beide Zeilen zusammen sind in Plan und Ist genau, was der
 * Vertrag vorher allein war — das Ergebnis ändert sich nicht, nur seine Stufen. Der
 * Status folgt dem Vertrag: ist seine Rate noch offen, ist es auch die Tilgung, und die
 * Hochrechnung nimmt für beide den Plan.
 *
 * Die Einordnung der einzelnen Buchung (`einordnung.ts`) bleibt davon unberührt: die
 * Zahlung IST eine Vertragszahlung. Die Teilung ist eine Rechnung über den Monat, keine
 * Eigenschaft der Buchung — eine Abbuchung trägt nicht in sich, welcher Teil Zins war.
 */
function tilgungAbspalten(
  vertraege: ErgebnisZeile,
  schulden: ErgebnisSchulden | undefined,
  o: { monat: string; von: string; zukunft: boolean },
): { fixkosten: ErgebnisZeile; tilgung: ErgebnisZeile } {
  let posten = vertraege.posten;
  const tilgungsposten: ErgebnisPosten[] = [];
  for (const v of schulden?.verbindlichkeiten ?? []) {
    const vertragId = v.vertragId;
    if (!vertragId) continue;
    const monatlich = tilgungIm(
      schulden!.staende.filter((s) => s.verbindlichkeitId === v.id),
      wirdGefuehrt(v),
      o.monat,
    );
    if (!monatlich) continue;
    const eigene = posten.filter((p) => p.vertragId === vertragId);
    if (eigene.length === 0) continue;

    const plan = Math.min(monatlich, Math.max(0, -summe(eigene.map((p) => p.plan))));
    const ist = o.zukunft ? null : Math.min(monatlich, Math.max(0, -summe(eigene.map((p) => p.ist ?? 0))));
    if (plan === 0 && (ist ?? 0) === 0) continue;

    // Abgezogen wird Posten für Posten, bis die Tilgung verteilt ist — der Normalfall ist
    // EIN Posten je Vertrag und Monat.
    let restPlan = plan;
    let restIst = ist ?? 0;
    posten = posten.map((p): ErgebnisPosten => {
      if (p.vertragId !== vertragId) return p;
      const abPlan = Math.min(restPlan, Math.max(0, -p.plan));
      const abIst = p.ist == null ? 0 : Math.min(restIst, Math.max(0, -p.ist));
      restPlan -= abPlan;
      restIst -= abIst;
      if (abPlan === 0 && abIst === 0) return p;
      return { ...p, plan: p.plan + abPlan || 0, ist: p.ist == null ? null : p.ist + abIst || 0, nurZinsen: true };
    });
    tilgungsposten.push({
      schluessel: `tilgung:${v.id}@${o.von}`,
      bezeichnung: v.bezeichnung,
      plan: -plan || 0,
      ist: ist == null ? null : -ist || 0,
      status: o.zukunft || eigene.every((p) => p.status === "offen") ? "offen" : "gebucht",
      vertragId,
      verbindlichkeitId: v.id,
    });
  }
  if (tilgungsposten.length === 0) return { fixkosten: vertraege, tilgung: zeile("tilgung", [], o.zukunft) };
  return { fixkosten: zeile("fixkosten", posten, o.zukunft), tilgung: zeile("tilgung", tilgungsposten, o.zukunft) };
}

function ueberleitung(ergebnis: Cent, teile: Record<UeberleitungId, Cent>): Ueberleitung {
  const posten = (Object.keys(teile) as UeberleitungId[])
    .map((id) => ({ id, betrag: teile[id] }))
    .filter((p) => p.betrag !== 0);
  return { ergebnis, posten, kontoaenderung: ergebnis + summe(posten.map((p) => p.betrag)) };
}

function zeile(id: ErgebnisZeileId, posten: readonly ErgebnisPosten[], zukunft: boolean): ErgebnisZeile {
  return {
    id,
    plan: summe(posten.map((p) => p.plan)),
    ist: zukunft ? null : summe(posten.map((p) => p.ist ?? 0)),
    posten,
  };
}

/** Ein Anteil ohne Plan dahinter, als eigener Posten. */
function einzelposten(x: Einordnung): ErgebnisPosten {
  return {
    schluessel: `${x.buchung.id}#${x.anteil}`,
    bezeichnung: x.buchung.notiz ?? "",
    datum: x.buchung.datum,
    plan: 0,
    ist: x.betrag,
    status: "ohnePlan",
    istId: x.buchung.id,
    kategorieId: x.kategorieId,
    vertragId: x.vertragId,
  };
}

/**
 * Eine Zeile, deren Plan aus Zahlungsregeln kommt: Einnahmen, Fixkosten, Vorsorge.
 *
 * Plan und Ist finden über den VERTRAG zusammen (`regel.vertragId` gegen die
 * Vertragszuordnung der Buchung), nicht über Betragsnähe. Die Zuordnung ist die Aussage,
 * die jemand getroffen hat; ein Betrag, der zufällig passt, ist keine.
 *
 * `periodisiert` verteilt Regel und Zahlung auf die Monate ihres Rhythmus, ab dem Monat
 * der Fälligkeit bzw. der Zahlung. Ohne zählt beides in seinem Monat.
 *
 * Was keiner Regel zugeordnet werden kann, steht als Einzelposten ohne Plan da — bei den
 * Fixkosten unverteilt, weil ohne Regel niemand weiss, für wie lange die Zahlung gilt.
 */
function regelZeile(
  id: ErgebnisZeileId,
  regeln: readonly Zahlungsregel[],
  zahlungen: readonly Einordnung[],
  o: { von: string; zukunft: boolean; periodisiert: boolean },
): ErgebnisZeile {
  const bis = toIso(addMonate(parseIso(o.von), 1));
  const jeVertrag = new Map<string, Zahlungsregel[]>();
  for (const r of regeln) {
    if (!r.vertragId) continue;
    const liste = jeVertrag.get(r.vertragId);
    if (liste) liste.push(r);
    else jeVertrag.set(r.vertragId, [r]);
  }
  // Hat ein Vertrag mehrere Regeln, gehört die Zahlung zu der, deren Betrag ihr am
  // nächsten liegt. Das Schema erlaubt den Fall; er ist selten.
  const regelFuer = (x: Einordnung): Zahlungsregel | undefined => {
    const kandidaten = x.vertragId ? jeVertrag.get(x.vertragId) : undefined;
    if (!kandidaten) return undefined;
    return [...kandidaten].sort(
      (a, b) => Math.abs(a.betrag - x.buchung.betrag) - Math.abs(b.betrag - x.buchung.betrag),
    )[0];
  };
  const zahlungenJeRegel = new Map<string, Einordnung[]>();
  const ohneRegel: Einordnung[] = [];
  for (const x of zahlungen) {
    const r = regelFuer(x);
    if (!r) {
      if (x.buchung.datum >= o.von && x.buchung.datum < bis) ohneRegel.push(x);
      continue;
    }
    const liste = zahlungenJeRegel.get(r.id);
    if (liste) liste.push(x);
    else zahlungenJeRegel.set(r.id, [x]);
  }

  const posten: ErgebnisPosten[] = [];
  for (const r of regeln) {
    const teile = o.periodisiert ? RHYTHMUS_MONATE[r.rhythmus] : 1;
    // Das Fenster, aus dem eine Zahlung noch in diesen Monat hineinreicht.
    const fensterAb = toIso(addMonate(parseIso(o.von), -(teile - 1)));
    const index = (datum: string) => monateZwischen(datum, o.von);

    const faellig = projiziereRegel(r, fensterAb, teile);
    const plan = summe(faellig.map((p) => monatsanteil(p.betrag, teile, index(p.datum))));
    const eigene = (zahlungenJeRegel.get(r.id) ?? []).filter(
      (x) => x.buchung.datum >= fensterAb && x.buchung.datum < bis,
    );
    const ist = o.zukunft ? null : summe(eigene.map((x) => monatsanteil(x.betrag, teile, index(x.buchung.datum))));
    if (plan === 0 && (ist ?? 0) === 0) continue;

    const dieserMonat = eigene.filter((x) => x.buchung.datum >= o.von);
    posten.push({
      schluessel: `${r.id}@${o.von}`,
      bezeichnung: r.bezeichnung,
      datum: faellig.length === 1 ? faellig[0].datum : undefined,
      plan,
      ist,
      status: o.zukunft || eigene.length === 0 ? "offen" : "gebucht",
      istId: dieserMonat.length === 1 && eigene.length === 1 ? dieserMonat[0].buchung.id : undefined,
      kategorieId: r.kategorieId,
      vertragId: r.vertragId,
      teile: teile > 1 ? teile : undefined,
    });
  }
  if (!o.zukunft) for (const x of ohneRegel) posten.push(einzelposten(x));

  posten.sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "") || a.plan - b.plan);
  return zeile(id, posten, o.zukunft);
}

/**
 * Womit ein angefangener Monat voraussichtlich endet: das Gebuchte, ergänzt um das, was
 * der Plan noch erwarten lässt.
 *
 * „Bisher" allein ist zur Monatsmitte zu gut (die Miete fehlt noch) oder zu schlecht
 * (das Gehalt fehlt noch), „geplant" allein übersieht, was schon anders gelaufen ist.
 * Die Hochrechnung nimmt je Posten die Zahl, die man heute für die wahrscheinlichere
 * halten muss:
 *
 *   • **Vertrag, noch offen** — der Plan. Die Zahlung kommt noch.
 *   • **Vertrag, gebucht** — das Ist. Was abgebucht wurde, gilt, auch wenn es vom Plan
 *     abweicht.
 *   • **Monatliches Budget** — das GRÖSSERE von Betrag und Verbrauch. Ein Budget gilt
 *     als ausgegeben, bis der Monat das Gegenteil zeigt; ist es schon überzogen, zählt
 *     die Überziehung. Wer den Rest als gespart rechnet, gibt ihn in Gedanken zweimal
 *     aus.
 *   • **Alles andere** (Rücklagen, aufbauende Budgets, die Rate eines Vorsorgeziels,
 *     Ungeplantes) — das Ist. Die Raten stehen schon mit dem ganzen Monat da, ob
 *     überwiesen oder nicht, und Ungeplantes lässt sich nicht vorhersagen: geschätzt
 *     wird hier nichts.
 *
 * Der letzte Punkt ist die Grenze der Rechnung: sie kennt keine Ausgabe, die noch
 * niemand geplant hat. Die Zahl ist deshalb eine Obergrenze für einen Monat, in dem
 * nichts Ungeplantes mehr passiert.
 */
export function hochrechnung(zeilen: readonly ErgebnisZeile[]): Cent {
  let erwartet = 0;
  for (const z of zeilen) {
    for (const p of z.posten) {
      if (p.ist == null) erwartet += p.plan;
      else if (z.id === "laufend") erwartet += Math.min(p.plan, p.ist);
      else if (p.status === "offen" && VERTRAGSZEILEN.has(z.id)) erwartet += p.plan;
      else erwartet += p.ist;
    }
  }
  return erwartet || 0;
}

/** Die Zeilen, deren Posten aus Zahlungsregeln kommen: dort heisst „offen", es kommt noch. */
// Die Tilgung gehört dazu: sie ist der Teil einer Vertragsrate, und ist die Rate noch
// offen, kommt auch die Tilgung noch.
const VERTRAGSZEILEN: ReadonlySet<ErgebnisZeileId> = new Set(["einnahmen", "fixkosten", "vorsorge", "tilgung"]);

/** Die Ergebnisrechnungen ab dem Monat von `heute` — der laufende und die folgenden. */
export function monatsErgebnisse(basis: Ergebnisbasis, anzahl = 3): MonatsErgebnis[] {
  const start = parseIso(basis.eingabe.heute);
  return Array.from({ length: Math.max(0, Math.floor(anzahl)) }, (_, i) =>
    monatsErgebnis(basis, toIso({ ...addMonate(start, i), d: 1 })),
  );
}

// ------------------------------------------------------------------ über mehrere Monate
//
// Was folgt, wertet eine REIHE von Monatsergebnissen aus — die Kostensicht der Analyse.
// Es steht hier und nicht in `auswertung.ts`, weil es auf den Zeilen dieser Rechnung
// aufbaut und nicht auf Buchungen: wer eine Zeile ergänzt, sieht die Stelle, an der sie
// in die Kennzahlen eingehen muss.

/** Die Zeilen, die KOSTEN sind — alle ausser den Einnahmen, in der Reihenfolge der Stufen. */
export const KOSTENZEILEN = ["fixkosten", "laufend", "ungeplant", "abschreibungen", "vorsorge", "tilgung"] as const;
export type KostenZeileId = (typeof KOSTENZEILEN)[number];

/**
 * Das Ist einer Zeile, vorzeichenbehaftet. Eine Zeile, die im Monat fehlt (siehe
 * `monatsErgebnis`: nur die ersten drei stehen immer da), ist 0 — nicht „unbekannt".
 */
export function zeilenIst(m: MonatsErgebnis, id: ErgebnisZeileId): Cent {
  return m.zeilen.find((z) => z.id === id)?.ist ?? 0;
}

/** Die Kosten eines Monats, POSITIV: die negierte Summe der Kostenzeilen. */
export function monatsKosten(m: MonatsErgebnis): Cent {
  return -summe(KOSTENZEILEN.map((id) => zeilenIst(m, id))) || 0;
}

export interface ErgebnisKennzahlen {
  /** Über wie viele Monate gemittelt wurde. */
  readonly monate: number;
  /** Durchschnitt je Monat, positiv. */
  readonly kostenJeMonat: Cent;
  /** Durchschnitt je Monat, vorzeichenbehaftet — „bleibt wirklich frei". */
  readonly ergebnisJeMonat: Cent;
  /**
   * Fixkosten ÷ Einnahmen (0…1, bei Überdeckung darüber). `null` ohne Einnahmen. Bei
   * einem Kredit zählen nur seine Zinsen — die Tilgung baut Vermögen auf.
   */
  readonly fixkostenquote: number | null;
  /** (Rücklagen + Vorsorge + Tilgung) ÷ Einnahmen. `null` ohne Einnahmen. */
  readonly sparquote: number | null;
}

/**
 * Die Kennzahlen der Kostensicht über eine Reihe von Monaten.
 *
 * Drei Entscheidungen stecken darin:
 *
 *   • Die Quoten rechnen über die SUMMEN des Zeitraums, nicht als Mittel der
 *     Monatsquoten. Ein Monat mit kleinen Einnahmen (Gehalt verschoben) hätte sonst
 *     dasselbe Gewicht wie alle anderen und zöge die Quote hoch, obwohl über das Jahr
 *     nichts anders war.
 *   • Ohne Einnahmen gibt es keine Quote (`null`). Eine 0 hiesse „nichts ist fix", ein
 *     Unendlich wäre keine Zahl, die jemand lesen kann.
 *   • Kosten werden durch Negieren der Summe positiv, nie mit `Math.abs` je Zeile — eine
 *     Erstattung, die eine Zeile ins Plus dreht, muss die Kosten SENKEN (dieselbe Regel
 *     wie im Kopf von `auswertung.ts`).
 *
 * Künftige Monate haben kein Ist und zählen nicht mit. Ob der LAUFENDE Monat hineingehört,
 * entscheidet der Aufrufer über die Liste, die er hereingibt — hier wird nicht gefiltert,
 * damit die Funktion für einen einzelnen Monat dasselbe sagt wie für zwölf.
 */
export function ergebnisKennzahlen(monate: readonly MonatsErgebnis[]): ErgebnisKennzahlen {
  const gewesen = monate.filter((m) => !m.zukunft);
  const n = gewesen.length;
  const ueberAlle = (id: ErgebnisZeileId) => summe(gewesen.map((m) => zeilenIst(m, id)));

  const einnahmen = ueberAlle("einnahmen");
  const kosten = summe(gewesen.map(monatsKosten));
  const ergebnis = summe(gewesen.map((m) => m.ergebnis.ist ?? 0));
  const fix = -ueberAlle("fixkosten");
  // Die Tilgung zählt mit: sie baut Vermögen auf wie eine Rücklagenrate, nur auf der
  // anderen Seite der Bilanz — die Schuld sinkt, statt dass ein Topf wächst.
  const gespart = -(ueberAlle("abschreibungen") + ueberAlle("vorsorge") + ueberAlle("tilgung"));

  return {
    monate: n,
    kostenJeMonat: n > 0 ? Math.round(kosten / n) : 0,
    ergebnisJeMonat: n > 0 ? Math.round(ergebnis / n) : 0,
    fixkostenquote: einnahmen > 0 ? fix / einnahmen : null,
    sparquote: einnahmen > 0 ? gespart / einnahmen : null,
  };
}

/**
 * Fehlt in diesem Monat die Rate einer Rücklage, die es damals gab?
 *
 * DIE GRENZE DER KOSTENSICHT NACH HINTEN. Eine Rücklage kennt nur ihren laufenden Zyklus:
 * `sollRuecklage` zählt ab `beginn`, und das Ausbuchen setzt `beginn` auf den Tag der
 * Ausgabe (mit Ziel) oder löscht die Rücklage (ohne). Für jeden Monat VOR dem Monat einer
 * Ausbuchung liefert die Rechnung deshalb keine Rate mehr für sie — obwohl in diesen
 * Monaten zurückgelegt wurde. Die Kosten dieser Monate stehen zu niedrig da, das Ergebnis
 * zu hoch.
 *
 * Reparieren liesse sich das nur mit einer Geschichte der Zyklen, die es nicht gibt. Was
 * sich sagen lässt, ist, WELCHE Monate betroffen sind — und das gehört neben die Zahl.
 * Der Monat der Ausbuchung selbst ist nicht betroffen: in ihm zählt schon die erste Rate
 * des neuen Zyklus.
 *
 * `ausbuchungsdaten` sind die ISO-Tage aller Ausbuchungen; `monat` ist „YYYY-MM".
 */
export function ruecklagenrateFehlt(monat: string, ausbuchungsdaten: readonly string[]): boolean {
  return ausbuchungsdaten.some((d) => monatVon(d) > monat);
}
