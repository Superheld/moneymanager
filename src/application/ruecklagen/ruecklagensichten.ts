// Rücklagen-Sicht — die Rücklagen samt Deckungsrechnung.
//
// Die Deckung ist der Grund, warum das hier steht und nicht im Screen: `ruecklagenDeckung`
// vergleicht den bis heute angesparten Bedarf mit dem, was auf den Konten liegt, und
// braucht dafür die realen Kontostände über den ganzen Buchungsbestand. Drei Auswahlen
// über zwei Aggregate — genau die Sorte Rechnung, die in einer Oberfläche irgendwann
// leicht anders noch einmal auftaucht.

import {
  kategorieUnterbaum,
  mindestRuecklage,
  ruecklagenKonten,
  realerKontostand,
  ruecklagenDeckung,
  ruecklagenfluss,
  zielwertGesamt,
  zyklusSoll,
  zyklusUngedeckt,
  hatGeschichte,
  getrageneBuchungen,
  ruecklagenEntnahmenAus,
  monatsRuecklage,
  planrateIm,
  ruecklagenart,
  ruecklagenFortschreibung,
  ruecklagenstand,
  verlaufsfenster,
  abschliessen,
  abschlussstaende,
  type Abschlussstand,
  type Ruecklagenentnahme,
  type Fortschreibungsmonat,
  type Zustaendigkeitssicht,
  type Ruecklagenart,
  type Cent,
  type IstBuchung,
  type Kategorie,
  type Ruecklage,
  type RuecklagenDeckung,
  type Ruecklagenfluss,
  type Zahlungskonto,
} from "../../core";
import type {
  LedgerPort,
  RuecklagenAusbuchung,
  RuecklagenRepository,
  UmsatzRepository,
  VertragRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
} from "../ports";
import { spurenAus } from "../buchung/zahlungsspuren";
import { belegZuBuchung } from "../buchung/belegZuBuchung";
import { buchungsname } from "../buchung/buchungszeile";
import type { Umsatz } from "../import/umsatz";
import { buchungszeile, zeilenkontext, type Buchungszeile, type Zeilenkontext } from "../buchung/buchungszeile";
import { vertragsnamenLaden } from "../vertraege/vertragszuordnung";
import { anspruchsbestandLaden, type BudgetanspruchDeps } from "../kontobelegung";
import { wartendeZuordnungen, type WartendeZuordnung } from "./wartendeZuordnungen";

/**
 * Die Budget-Seite gehört dazu, weil der Anspruch einer Rücklage um das sinkt, was sie über
 * ihre Kategorie gefunden hat — und das entscheidet dieselbe Zuständigkeit wie den
 * Verbrauch eines Budgets.
 */
export interface RuecklagenDeps extends BudgetanspruchDeps {
  readonly ruecklagenRepo: RuecklagenRepository;
  readonly ledger: LedgerPort;
  readonly kontoRepo: ZahlungskontoRepository;
  readonly regelRepo: ZahlungsregelRepository;
  readonly vertragRepo: VertragRepository;
  readonly umsatzRepo: UmsatzRepository;
}

/** Eine Buchung, wie sie in der Auswahl beim Ausbuchen steht. */
export interface Buchungswahl {
  readonly id: string;
  readonly datum: string;
  readonly betrag: Cent;
  /** Empfänger, sonst die Notiz — das, woran man die Zahlung wiedererkennt. */
  readonly bezeichnung: string;
  /** Die Kategorie der Buchung; fehlt bei einer geteilten oder noch nicht eingeordneten. */
  readonly kategorieId?: string;
}

/** Eine Buchung in der Auswahl EINER Rücklage — mit der Auskunft, ob sie nahe liegt. */
export interface Buchungsvorschlag extends Buchungswahl {
  /** Liegt die Buchung in der Kategorie der Rücklage (oder darunter)? */
  readonly passt: boolean;
}

/**
 * Die Auswahl beim Ausbuchen EINER Rücklage: zuerst, was in ihrer Kategorie liegt, dann
 * die jüngsten Abflüsse.
 *
 * Seit Paket 5 nur noch für den Altbestand: ausgebucht wird nur eine Rücklage OHNE
 * Kategorie; eine mit Kategorie findet ihre Ausgaben selbst und wird ohne Buchungswahl
 * abgeschlossen (`ruecklageAbschliessen`). Die Sortierung nach der Kategorie bleibt
 * trotzdem stehen — sie schadet ohne Kategorie nicht, und die Tests der Regel tragen sie.
 *
 * Ohne Kategorie an der Rücklage ist die Liste dieselbe wie bisher.
 */
export function buchungswahlFuer(
  sicht: Pick<Ruecklagensicht, "buchungswahl" | "kategorien">,
  ruecklage: Pick<Ruecklage, "kategorieId">,
): Buchungsvorschlag[] {
  const baum = ruecklage.kategorieId ? kategorieUnterbaum(sicht.kategorien, ruecklage.kategorieId) : new Set<string>();
  const alle = sicht.buchungswahl.map((b) => ({ ...b, passt: !!b.kategorieId && baum.has(b.kategorieId) }));
  // `buchungswahl` ist schon nach Datum sortiert, neueste zuerst; die Teilung erhält das.
  return [...alle.filter((b) => b.passt), ...alle.filter((b) => !b.passt)].slice(0, WAHL_ANZAHL);
}

/**
 * So viele Abflüsse stehen beim Ausbuchen zur Auswahl.
 *
 * Eine Auswahl über den ganzen Bestand wäre eine Liste, die niemand durchsieht; die
 * gesuchte Zahlung liegt in aller Regel wenige Tage zurück — oder in der Kategorie der
 * Rücklage, und die steht dann vorn (`buchungswahlFuer`).
 */
const WAHL_ANZAHL = 50;

/**
 * Eine Ausbuchung, wie die Geschichte sie zeigt.
 *
 * EINE Liste für beide Formen, und das ist die Entscheidung: eine Ausbuchung ist dasselbe
 * Ereignis, ob die Rücklage danach von vorn anfängt (mit Ziel) oder beendet ist (frei).
 * Die Fragen an sie sind dieselben — wann, wofür, wie viel war angespart, was war
 * ungedeckt —, und zwei Listen mit denselben Spalten trennten, was zusammengehört. Die
 * beendete Rücklage ist darin der Sonderfall: ihre letzte Ausbuchung trägt `beendet`.
 */
export interface Ausbuchungszeile {
  /** Die ID der Ausbuchung — bei einer beendeten Rücklage ohne Ausbuchung `beendet:<id>`. */
  readonly id: string;
  readonly ruecklageId: string;
  /** Leer nur, wenn die Rücklage fehlt; dann wählt die Oberfläche ein Wort. */
  readonly bezeichnung: string;
  /** Der Tag des Ausbuchens; bei einer beendeten Rücklage ist es der Tag des Endes. */
  readonly datum: string;
  /**
   * Was ausgegeben wurde, positiv. Mit verknüpfter Buchung ihr Betrag, sonst der
   * eingetragene — dieselbe Wahl wie in der Ergebnisrechnung, die das Ungedeckte gegen
   * die Buchung prüft. Zwei Beträge für denselben Kauf liefen sonst auseinander.
   */
  readonly ausgabe: Cent;
  /** Die verknüpfte Buchung, falls es sie noch gibt — der Weg in den Buchungsdialog. */
  readonly buchung?: IstBuchung;
  /** Empfänger, sonst Notiz oder Verwendungszweck der Buchung; leer ohne Buchung. */
  readonly buchungsname: string;
  /** Was im beendeten Zyklus angespart sein sollte; `null`, wenn er nicht festgehalten ist. */
  readonly angespart: Cent | null;
  /** Der Teil der Ausgabe über dem Angesparten; `null` wie oben — dann gilt sie als gedeckt. */
  readonly ungedeckt: Cent | null;
  /** Hat diese Ausbuchung die Rücklage beendet? */
  readonly beendet: boolean;
  /**
   * War es ein ABSCHLIESSEN (seit Paket 5): eine Rücklage mit Kategorie, ohne verknüpfte
   * Buchung und ohne eingetragenen Betrag. Dann ist `ausgabe` das, was sie im Zyklus über
   * ihre Kategorie getragen hat, `angespart` die Raten bis zum Vormonat, und `frei` sagt,
   * was auf dem Konto frei geworden ist.
   */
  readonly abschluss: boolean;
  /** Beim Abschliessen: was frei geworden ist (über null); sonst `null`. */
  readonly frei: Cent | null;
}

/**
 * Was die Geschichte braucht, um ein Abschliessen zu rechnen: die Rücklagen (laufende und
 * beendete, für ihre Ratenreihe) und was jede über ihre Kategorie getragen hat — dieselben
 * Entnahmen wie im Anspruch auf dem Konto.
 */
export interface Abschlussbestand {
  readonly ruecklagen: readonly Ruecklage[];
  readonly entnahmen: ReadonlyMap<string, readonly Ruecklagenentnahme[]>;
}

/**
 * Die Geschichte der Rücklagen: jede Ausbuchung, jüngste zuerst.
 *
 * `beendete` kommt aus einem eigenen Leseweg (`RuecklagenRepository.beendete`), weil
 * `alle()` beendete Rücklagen nicht ausliefert. Gebraucht wird er für zweierlei: um die
 * Ausbuchung zu kennzeichnen, mit der eine Rücklage endete — und damit eine beendete
 * Rücklage, zu der es keine Ausbuchung gibt, nicht unsichtbar bleibt. Über die App
 * entsteht das nicht (beendet wird nur durch Ausbuchen), aber `beendet_am` ist eine
 * Spalte, und was in ihr steht, soll auch irgendwo zu sehen sein.
 */
export function ruecklagenGeschichte(
  ausbuchungen: readonly RuecklagenAusbuchung[],
  beendete: readonly Ruecklage[],
  buchungen: readonly IstBuchung[],
  umsaetze: readonly Umsatz[],
  bestand?: Abschlussbestand,
): Ausbuchungszeile[] {
  const beendetIds = new Set(beendete.map((r) => r.id));
  // Je Rücklage einmal: der Stand jedes ihrer Zyklen am Abschlusstag (`abschlussstaende`).
  const staende = new Map<string, ReadonlyMap<string, Abschlussstand>>();
  const standVon = (a: RuecklagenAusbuchung): Abschlussstand | undefined => {
    const r = bestand?.ruecklagen.find((x) => x.id === a.ruecklageId);
    if (!r || !bestand) return undefined;
    let je = staende.get(r.id);
    if (!je) {
      je = abschlussstaende(r, ausbuchungen, bestand.entnahmen.get(r.id) ?? []);
      staende.set(r.id, je);
    }
    return je.get(a.id);
  };
  const buchungJeId = new Map(buchungen.map((b) => [b.id, b]));
  const umsatzJeBuchung = belegZuBuchung(umsaetze);
  const sortiert = [...ausbuchungen].sort((a, b) => b.datum.localeCompare(a.datum) || b.id.localeCompare(a.id));

  // Die JÜNGSTE Ausbuchung einer beendeten Rücklage ist die, mit der sie endete. Eine
  // Rücklage mit Ziel, die später auf eine freie Rate umgestellt und dann ausgebucht
  // wurde, hat davor weitere — die haben sie nur neu beginnen lassen.
  const gesehen = new Set<string>();
  const zeilen = sortiert.map((a): Ausbuchungszeile => {
    const buchung = a.istbuchungId ? buchungJeId.get(a.istbuchungId) : undefined;
    const ausgabe = buchung ? Math.max(0, -buchung.betrag) : a.betrag;
    const beendet = beendetIds.has(a.ruecklageId) && !gesehen.has(a.ruecklageId);
    gesehen.add(a.ruecklageId);
    // Ein Abschliessen erkennt man an dem, was ihm fehlt: keine Buchung, kein Betrag, aber
    // eine Kategorie und ein festgehaltener Zyklus. Eine Ausbuchung aus der Zeit davor
    // trägt eine Buchung oder einen Betrag und wird gezeigt wie bisher.
    const stand = !a.istbuchungId && a.betrag === 0 && a.kategorieId && hatGeschichte(a) ? standVon(a) : undefined;
    if (stand) {
      return {
        id: a.id,
        ruecklageId: a.ruecklageId,
        bezeichnung: a.bezeichnung ?? "",
        datum: a.datum,
        ausgabe: stand.entnahmen,
        buchungsname: "",
        angespart: stand.raten,
        ungedeckt: Math.max(0, -stand.stand),
        beendet,
        abschluss: true,
        frei: Math.max(0, stand.stand),
      };
    }
    return {
      id: a.id,
      ruecklageId: a.ruecklageId,
      bezeichnung: a.bezeichnung ?? "",
      datum: a.datum,
      ausgabe,
      buchung,
      buchungsname: buchung ? buchungsname(buchung.notiz, umsatzJeBuchung.get(buchung.id)) : "",
      angespart: hatGeschichte(a) ? zyklusSoll(a, a.datum) : null,
      ungedeckt: zyklusUngedeckt(a, ausgabe),
      beendet,
      abschluss: false,
      frei: null,
    };
  });

  const ohneAusbuchung = beendete
    .filter((r) => !gesehen.has(r.id))
    .map((r): Ausbuchungszeile => ({
      id: `beendet:${r.id}`,
      ruecklageId: r.id,
      bezeichnung: r.bezeichnung,
      datum: r.beendetAm as string,
      ausgabe: 0,
      buchungsname: "",
      angespart: null,
      ungedeckt: null,
      beendet: true,
      abschluss: false,
      frei: null,
    }));

  return [...zeilen, ...ohneAusbuchung].sort((a, b) => b.datum.localeCompare(a.datum));
}

/**
 * Eine Rücklage, wie die EINE Liste des Bereichs sie zeigt (seit Paket 4, ADR-0006) — beide
 * Sorten, jede Zahl schon gerechnet. Bis dahin standen zwei Karten da: die Rücklagen von
 * Hand mit Balken und die aufbauenden Budgets als Tabelle der Budgets.
 */
export interface Ruecklagenzeile {
  readonly ruecklage: Ruecklage;
  readonly art: Ruecklagenart;
  /** Der Name der Kategorie; fehlt bei einem Altfall ohne Kategorie. */
  readonly kategorieName?: string;
  /**
   * Was sie in diesem Monat zurücklegt: bei einer, die abgeschlossen wird, Ziel ÷ Frist
   * bzw. die Rate (wie bisher in der Liste), bei einer, die weiterläuft, die Rate der
   * Reihe in diesem Monat (wie bisher die Monatsrate des aufbauenden Budgets).
   */
  readonly rate: Cent;
  /** Der Stand heute, je Sorte gezählt (`ruecklagenstand`) — darf negativ sein. */
  readonly stand: Cent;
  /** Was auf dem Konto liegen sollte: der Stand über null (dieselbe Zahl wie in der Deckung). */
  readonly soll: Cent;
  /** Was davon auf dem Konto liegt; `null` ohne Konto. */
  readonly tatsaechlich: Cent | null;
  /** Der Name des Kontos; fehlt ohne Konto oder wenn es das Konto nicht mehr gibt. */
  readonly kontoName?: string;
  /** Nur eine, die abgeschlossen wird, lässt sich abschliessen (bzw. im Altbestand ausbuchen). */
  readonly ausbuchbar: boolean;
  /**
   * Wie: `abschliessen` bei einer mit Kategorie (Paket 5, ohne Buchungswahl),
   * `ausbuchen` beim Altbestand ohne Kategorie (mit Buchungswahl, wie vorher). Fehlt bei
   * einer, die weiterläuft.
   */
  readonly abschlussweg?: "abschliessen" | "ausbuchen";
}

export interface Ruecklagensicht {
  readonly ruecklagen: readonly Ruecklage[];
  /** Die eine Liste des Bereichs, in der Reihenfolge der Rücklagen (nach Name). */
  readonly zeilen: readonly Ruecklagenzeile[];
  /** Die Sicht hinter Stand und Entnahmen — für den Verlauf einer Rücklage. */
  readonly verlaufsicht: Zustaendigkeitssicht;
  /** Was die Buchungszeilen eines Monats im Verlauf brauchen. */
  readonly zeilenkontext: Zeilenkontext;
  readonly konten: readonly Zahlungskonto[];
  /** Für die Kategoriewahl im Dialog und für `buchungswahlFuer`. */
  readonly kategorien: readonly Kategorie[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  /** Reicht das Ersparte für den bis heute aufgelaufenen Bedarf? Je Rücklage ein Posten. */
  readonly deckung: RuecklagenDeckung;
  /** Summe der monatlichen Raten beider Sorten — derselbe Wert wie `fluss.bedarf`. */
  readonly proMonat: Cent;
  /** Summe der Ziele — freie Rücklagen zählen nicht mit, sie haben keins. */
  readonly zielwert: Cent;
  /** Faustformel: drei Monats-Vertragseinnahmen. Ein Massstab, keine Regel. */
  readonly mindest: Cent;
  /**
   * Was auf den Rücklagenkonten heute liegt (`ruecklagenKonten`: Klasse Rücklage oder
   * einer Rücklage zugeordnet) — die Zahl, die der Tacho gegen `mindest` stellt. Der
   * KONTOSTAND, nicht die Deckung: die Faustformel fragt nach dem Notgroschen insgesamt,
   * nicht danach, was davon schon einzelnen Zwecken oder Budgets gehört.
   */
  readonly ruecklagenStand: Cent;
  /** Die monatlichen Vertragseinnahmen, aus denen `mindest` folgt. */
  readonly vertragseinnahmen: Cent;
  /**
   * Was bisher ausgebucht wurde, jüngste zuerst — laufende wie beendete Rücklagen
   * (`ruecklagenGeschichte`).
   */
  readonly geschichte: readonly Ausbuchungszeile[];
  /** Abflüsse, die sich beim Ausbuchen verknüpfen lassen — jüngste zuerst. */
  readonly buchungswahl: readonly Buchungswahl[];
  /** Was von den liquiden Mitteln in die Rücklagen wandert — Bedarf, Plan und Ist. */
  readonly fluss: Ruecklagenfluss;
  /** Was an jeder Kategorie schon hängt — für die Hinweise im Dialog. */
  readonly kategoriebelegung: Kategoriebelegung;
  /** Was auf eine Zuordnung wartet — die Karte „Wartet auf Zuordnung" (`wartendeZuordnungen`). */
  readonly wartend: readonly WartendeZuordnung[];
}

/**
 * Was an einer Kategorie schon hängt, für den Dialog einer Rücklage: hängt dort schon
 * eine, warten Buchungen dort künftig auf eine Zuordnung; liegt dort ein monatliches
 * Budget, nimmt eine neue Rücklage dort nichts an (Hinweis auf eine Unterkategorie).
 */
export interface Kategoriebelegung {
  /** Kategorie-ID → die laufenden Rücklagen daran. */
  readonly ruecklagen: ReadonlyMap<string, readonly { readonly id: string; readonly bezeichnung: string }[]>;
  /** Kategorien mit einem monatlichen Budget. */
  readonly monatlich: ReadonlySet<string>;
}

function kategoriebelegung(ruecklagen: readonly Ruecklage[], budgets: readonly { kategorieId: string }[]): Kategoriebelegung {
  const an = new Map<string, { id: string; bezeichnung: string }[]>();
  for (const r of ruecklagen) {
    if (!r.kategorieId) continue;
    const liste = an.get(r.kategorieId) ?? [];
    liste.push({ id: r.id, bezeichnung: r.bezeichnung });
    an.set(r.kategorieId, liste);
  }
  return { ruecklagen: an, monatlich: new Set(budgets.map((b) => b.kategorieId)) };
}

/**
 * Die monatlichen Einnahmen aus Verträgen, auf den Monat normalisiert.
 *
 * Nur laufende Verträge und nur Zuflüsse. Ein jährlicher Vertrag wird durch zwölf
 * geteilt: sonst hinge die Faustformel am Kalender — im Monat der Jahreszahlung
 * spränge die Mindestrücklage, in den elf anderen fehlte sie.
 */
function vertragseinnahmenProMonat(
  regeln: readonly { betrag: Cent; rhythmus: string; charakter: string; vertragId?: string }[],
): Cent {
  let summe = 0;
  for (const r of regeln) {
    if (!r.vertragId) continue;
    // Nur Erträge. Der Charakter entscheidet und nicht das Vorzeichen des Betrags: eine
    // Zahlungsregel ist eine PLANGRÖSSE, und dort trägt die Einordnung die Richtung
    // (siehe „Für eine PLANGRÖSSE bleibt die Ableitung" in `src/core/buchung/CLAUDE.md`).
    if (r.charakter !== "Ertrag") continue;
    const monate = RHYTHMUS_IN_MONATEN[r.rhythmus] ?? 1;
    summe += Math.abs(r.betrag) / monate;
  }
  return Math.round(summe);
}

/**
 * Wie viele Monate ein Rhythmus überspannt.
 *
 * Bewusst hier und nicht aus `RHYTHMUS_MONATE` des Kerns übernommen: dort steht die
 * Projektion für den Zahlungskalender, hier eine Normalisierung auf den Monat. Sollten
 * die beiden je auseinanderlaufen, ist das ein Fehler in genau einer von ihnen — und mit
 * einer geteilten Konstante fiele er in beiden zugleich falsch aus.
 */
const RHYTHMUS_IN_MONATEN: Record<string, number> = {
  monatlich: 1,
  vierteljaehrlich: 3,
  halbjaehrlich: 6,
  jaehrlich: 12,
};

/** Erster Tag des Folgemonats — die obere, ausschliessende Grenze des laufenden Monats. */
function monatDanach(heute: string): string {
  const [j, m] = heute.split("-").map(Number);
  const gesamt = j * 12 + m; // m ist 1-basiert, also schon der Folgemonat
  return `${String(Math.floor(gesamt / 12)).padStart(4, "0")}-${String((gesamt % 12) + 1).padStart(2, "0")}-01`;
}

export async function ruecklagenLaden(
  deps: RuecklagenDeps,
  heute: string,
): Promise<Ruecklagensicht> {
  const [ruecklagen, beendete, buchungen, konten, regeln, vertraege, ausbuchungen, umsaetze, budget, kategorien, vertragsnamen, vertragszuordnungen, ruecklagenzuordnungen] =
    await Promise.all([
      deps.ruecklagenRepo.alle(),
      deps.ruecklagenRepo.beendete(),
      deps.ledger.alle(),
      deps.kontoRepo.alle(),
      deps.regelRepo.alle(),
      deps.vertragRepo.alle(),
      deps.ruecklagenRepo.ausbuchungen(),
      deps.umsatzRepo.alle(),
      anspruchsbestandLaden(deps),
      deps.kategorieRepo.alle(),
      vertragsnamenLaden(deps.zuordnungRepo, deps.vertragRepo),
      deps.zuordnungRepo.alle(),
      deps.ruecklagenzuordnungRepo.alle(),
    ]);
  const kontostaende = new Map(konten.map((k) => [k.id, realerKontostand(k, buchungen)]));
  // Nur laufende Verträge: ein gekündigter zahlt nicht mehr ein, und eine Mindestrücklage
  // auf Einnahmen zu stützen, die es nicht mehr gibt, wäre die falsche Beruhigung.
  const laufend = new Set(vertraege.filter((v) => v.status === "aktiv").map((v) => v.id));
  const einnahmen = vertragseinnahmenProMonat(
    regeln.filter((r) => r.vertragId && laufend.has(r.vertragId)),
  );

  // Das Ist über den LAUFENDEN Monat, weil Bedarf und Plan Monatsgrössen sind. Ein
  // Fenster über den ganzen Bestand daneben verglichen Jahre mit einem Monat.
  const fluss = ruecklagenfluss(
    buchungen,
    konten,
    ruecklagen,
    regeln,
    `${heute.slice(0, 7)}-01`,
    monatDanach(heute),
  );

  const deckung = ruecklagenDeckung(ruecklagen, heute, kontostaende, budget.bestand);
  const kontoNamen = new Map(konten.map((k) => [k.id, k.bezeichnung]));
  const kategorieNamen = new Map(kategorien.map((k) => [k.id, k.name]));
  const zeilen = deckung.posten.map((p): Ruecklagenzeile => {
    const r = p.ruecklage;
    const art = ruecklagenart(r);
    return {
      ruecklage: r,
      art,
      kategorieName: r.kategorieId ? kategorieNamen.get(r.kategorieId) : undefined,
      rate: art === "fortlaufend" ? planrateIm(r, heute.slice(0, 7)) : monatsRuecklage(r),
      stand: ruecklagenstand(r, ausbuchungen, budget.bestand.entnahmen?.get(r.id) ?? [], heute).stand,
      soll: p.soll,
      tatsaechlich: p.tatsaechlich,
      kontoName: r.kontoId ? kontoNamen.get(r.kontoId) : undefined,
      ausbuchbar: art !== "fortlaufend",
      ...(art !== "fortlaufend" ? { abschlussweg: r.kategorieId ? ("abschliessen" as const) : ("ausbuchen" as const) } : {}),
    };
  });

  return {
    ruecklagen,
    zeilen,
    verlaufsicht: budget.sicht,
    zeilenkontext: zeilenkontext(umsaetze, konten, kategorien, vertragsnamen),
    konten,
    kategorien,
    kontoNamen,
    deckung,
    proMonat: fluss.bedarf,
    zielwert: zielwertGesamt(ruecklagen),
    mindest: mindestRuecklage(einnahmen),
    ruecklagenStand: [...ruecklagenKonten(konten, ruecklagen)].reduce(
      (s, id) => s + (kontostaende.get(id) ?? 0),
      0,
    ),
    vertragseinnahmen: einnahmen,
    geschichte: ruecklagenGeschichte(ausbuchungen, beendete, buchungen, umsaetze, {
      ruecklagen: [...ruecklagen, ...beendete],
      entnahmen: budget.bestand.entnahmen ?? new Map(),
    }),
    wartend: wartendeZuordnungen({
      buchungen, kategorien, budgets: budget.budgets, konten, zuordnungen: vertragszuordnungen, vertraege,
      ausbuchungen, ruecklagen, beendete, ruecklagenzuordnungen,
    }, umsaetze),
    fluss,
    kategoriebelegung: kategoriebelegung(ruecklagen, budget.budgets),
    buchungswahl: spurenAus(buchungen, umsaetze)
      // Nur Abflüsse: eine Rücklage wird ausgegeben, nicht eingenommen.
      .filter((sp) => sp.betrag < 0)
      // ALLE Abflüsse, neueste zuerst — gekürzt wird in `buchungswahlFuer`, nachdem die
      // zur Rücklage passenden nach vorn geholt sind. Vorher gekürzt fiele die gesuchte
      // Zahlung heraus, sobald sie älter ist als die fünfzig jüngsten.
      .sort((a, b) => b.datum.localeCompare(a.datum))
      .map((sp) => ({
        id: sp.id,
        datum: sp.datum,
        betrag: sp.betrag,
        bezeichnung: sp.gegenpartei || sp.verwendungszweck || "",
        kategorieId: sp.kategorieId,
      })),
  };
}

/**
 * Der Verlauf einer Rücklage: die letzten `anzahl` Monate bis einschliesslich des Monats von
 * `heute`, jeder als Fortschreibung (Übertrag, Rate, Entnahmen, Rest) — dieselbe Form wie
 * beim Budget (`Fortschreibungsmonat`), für JEDE Rücklage. Bis Paket 4 hatte das nur das aufbauende
 * Budget. Rein und ohne Ladevorgang: gerechnet wird gegen dieselbe Sicht wie die Liste.
 */
export function ruecklagenVerlauf(s: Pick<Ruecklagensicht, "verlaufsicht">, r: Ruecklage, heute: string, anzahl = 12): Fortschreibungsmonat[] {
  const { vonMonat, bisMonat } = verlaufsfenster(heute, anzahl);
  const entnahmen = ruecklagenEntnahmenAus(s.verlaufsicht).get(r.id) ?? [];
  return ruecklagenFortschreibung(r, s.verlaufsicht.ausbuchungen ?? [], entnahmen, vonMonat, bisMonat);
}

/**
 * Die Buchungen, die eine Rücklage in einem Monat des Verlaufs getragen hat — als
 * `Buchungszeile`, mit Vorzeichen wie überall. Dieselbe Auswahl wie ihr Stand.
 */
export function ruecklagenzeilenImMonat(
  s: Pick<Ruecklagensicht, "verlaufsicht" | "zeilenkontext">,
  r: Ruecklage,
  monat: Fortschreibungsmonat,
): readonly Buchungszeile[] {
  return getrageneBuchungen(s.verlaufsicht, r.id, monat.von, monat.bis).map((p) =>
    buchungszeile(p.buchung, -p.betrag, p.kategorieId, s.zeilenkontext),
  );
}

/** Was ein Abschluss an einem Tag ergäbe — der Stand, den der Dialog vor dem Speichern zeigt. */
export interface Abschlussvorschau {
  /** Was der Zyklus bis zum Vormonat des Tages angespart hat. */
  readonly angespart: Cent;
  /** Was er bis einschliesslich des Tages über seine Kategorie getragen hat. */
  readonly getragen: Cent;
  /** Was frei würde, über null. */
  readonly frei: Cent;
  /** Was mehr getragen wurde, als da war — hat seinen Monat schon gekostet. */
  readonly ungedeckt: Cent;
}

/**
 * Der Stand einer Rücklage, wenn sie am Tag `am` abgeschlossen würde — dieselbe Rechnung
 * wie beim Speichern (`abschliessen` im Kern), gegen dieselbe Sicht wie die Liste.
 * Rein und ohne Ladevorgang, damit der Dialog bei jedem Datum neu fragen kann.
 */
export function abschlussvorschau(s: Pick<Ruecklagensicht, "verlaufsicht">, r: Ruecklage, am: string): Abschlussvorschau | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(am)) return null;
  const entnahmen = ruecklagenEntnahmenAus(s.verlaufsicht).get(r.id) ?? [];
  try {
    const a = abschliessen(r, (s.verlaufsicht.ausbuchungen ?? []).filter((x) => x.ruecklageId === r.id), entnahmen, am, "ende");
    return { angespart: a.raten, getragen: a.entnahmen, frei: a.frei, ungedeckt: a.ungedeckt };
  } catch {
    // Ein Tag, den es nicht gibt (`parseIso` wirft): der Dialog zeigt dann keinen Stand,
    // und beim Speichern sagt die Anwendungsgrenze, was falsch ist.
    return null;
  }
}
