// Der Buchungsdialog braucht fast alles — und hat es sich bisher selbst geholt.
//
// Das ist die Datei mit den meisten Repositories im ganzen Projekt gewesen (acht), und
// der Grund ist echt: der Dialog zeigt eine Buchung MIT ihrem Zusammenhang. Herkunft aus
// dem Import, das Gegenbein einer Umbuchung, der Vertrag dahinter, Dublettenverdacht,
// die Kategorien zur Auswahl. Nur folgt daraus nicht, dass er sich das selbst zusammen-
// suchen muss.
//
// Alles LESENDE steht hier. Die Schreibfälle bleiben eigene Use-Cases (buchungErfassen,
// buchungSplitten, zuordnungVonHand …) — sie sind schon jeweils an ihrem Ort.
//
// Direkt in `src/application/` und nicht in `buchung/`: der Zusammenhang, den der Dialog
// zeigt, kommt aus Verträgen und Rücklagen, und beide stehen in der Rangfolge über der
// Buchung. Eine Sicht über mehrere Bereiche gehört keinem von ihnen.

import { belegZuBuchung } from "./buchung/belegZuBuchung";
import { einordnungJeBuchung, type Buchungseinordnung } from "./einordnungssicht";
import type {
  IstBuchung,
  Kategorie,
  Vertrag,
  Vertragszuordnung,
  Zahlungskonto,
  Zahlungsregel,
} from "../core";
import type { ImportLauf, Umsatz } from "./import";
import {
  freigegebenePaare,
  ledgerVerdacht,
  type Dublettenfreigabe,
  type Dublettenverdacht,
} from "./dubletten/dublettensicht";
import type {
  BudgetRepository,
  DublettenfreigabeRepository,
  ImportLaufRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
  RuecklagenRepository,
  RuecklagenzuordnungRepository,
} from "./ports";
import { alleRuecklagen, ruecklagenbestandLaden } from "./ruecklagen/ruecklagenbestand";
import { ruecklagenwahlJeBuchung, type Ruecklagenwahl } from "./ruecklagen/ruecklageZuordnen";

export interface BuchungsdetailDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly regelRepo: ZahlungsregelRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
  readonly ledger: LedgerPort;
  readonly vertragRepo: VertragRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
  readonly freigabeRepo: DublettenfreigabeRepository;
  /** Für die Einordnung — dieselbe Begründung wie in `KontenDeps`. */
  readonly budgetRepo: BudgetRepository;
  /**
   * Für die Einordnung: welche Rücklage eine Ausgabe über ihre Kategorie findet, und nur
   * ein Kauf, den eine Rücklage trug, gilt als Entnahme.
   */
  readonly ruecklagenRepo: RuecklagenRepository;
  /** Für die Einordnung: die ausdrücklichen Zuordnungen zu einer Rücklage. */
  readonly ruecklagenzuordnungRepo: RuecklagenzuordnungRepository;
  /**
   * Die Konto-Zuordnungen der Bankzugänge — daran hängt, welches Konto ONLINE geführt
   * wird. Optional, damit ein Aufrufer ohne Bankanbindung (Tests, Analyse) den Dialog
   * bekommt, ohne ein Repository mitzubringen, das er nicht hat: fehlt es, gilt kein
   * Konto als online, und das ist genau der Stand vor der Bankanbindung.
   */
  readonly kontozuordnungen?: () => Promise<readonly { readonly zahlungskontoId: string }[]>;
}

export interface Buchungsdetaildaten {
  readonly konten: readonly Zahlungskonto[];
  readonly kategorien: readonly Kategorie[];
  readonly regeln: readonly Zahlungsregel[];
  readonly umsaetze: readonly Umsatz[];
  readonly laeufe: readonly ImportLauf[];
  readonly buchungen: readonly IstBuchung[];
  readonly vertraege: readonly Vertrag[];
  readonly zuordnungen: readonly Vertragszuordnung[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  readonly kategorieNamen: ReadonlyMap<string, string>;
  /** Buchungs-ID → Umsatz. Empfänger, Zweck und Herkunft stehen dort. */
  readonly umsatzZuBuchung: ReadonlyMap<string, Umsatz>;
  /**
   * Buchungs-ID → Dublettenverdacht — DIESELBE Rechnung wie im Kontoauszug.
   *
   * Der Dialog hat sie sich lange selbst gerechnet, und zwar anders: gegen alle Umsätze
   * des Kontos, ohne zu prüfen, ob es die Gegenbuchung noch gibt. Ergebnis waren zwei
   * Auskünfte über dieselbe Buchung — im Auszug längst still, im Dialog weiter gemahnt.
   * Für einen noch nicht verbuchten ENTWURF gilt die andere Frage; die beantwortet
   * `entwurfVerdacht` (siehe dublettensicht.ts).
   */
  readonly dublettenverdacht: ReadonlyMap<string, Dublettenverdacht>;
  /** Die „ist kein Duplikat"-Entscheidungen, als Paarschlüssel. */
  readonly freigegeben: ReadonlySet<string>;
  readonly freigaben: readonly Dublettenfreigabe[];
  /**
   * Buchungs-ID → Einordnung — DIESELBE Abbildung wie im Kontoauszug, aus derselben
   * Funktion. Der Dialog sagt dazu den Satz mit dem Warum; stünde dort eine andere Art
   * als an der Zeile, aus der er geöffnet wurde, wäre der Satz die Erklärung von nichts.
   */
  readonly einordnungen: ReadonlyMap<string, readonly Buchungseinordnung[]>;
  /**
   * Konten, die an einer Bankverbindung hängen.
   *
   * Auf ihnen bestimmt die BANK, was steht: Datum und Betrag sind dort Tatsachen, keine
   * Eingabe, und eine von Hand geänderte Zahl wäre eine Behauptung gegen den Kontoauszug,
   * die beim nächsten Abgleich als Abweichung auftaucht — ohne dass noch jemand wüsste,
   * dass sie von Hand entstanden ist. Was sich hier ändern lässt, ist die EINORDNUNG
   * (Bezeichnung, Kategorie, Vertrag): die gehört dem Nutzer, nicht der Bank.
   */
  readonly onlineKonten: ReadonlySet<string>;
  /**
   * Buchungs-ID → die Anteile, für die eine Rücklage zu wählen ist (`ruecklagenwahlJeBuchung`).
   * Fehlt eine Buchung, gibt es bei ihr nichts zu wählen.
   */
  readonly ruecklagenwahl: ReadonlyMap<string, readonly Ruecklagenwahl[]>;
}

export async function buchungsdetailLaden(
  deps: BuchungsdetailDeps,
): Promise<Buchungsdetaildaten> {
  const [konten, kategorien, regeln, umsaetze, laeufe, buchungen, vertraege, zuordnungen, freigaben, budgets] =
    await Promise.all([
      deps.kontoRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.regelRepo.alle(),
      deps.umsatzRepo.alle(),
      deps.laufRepo.alle(),
      deps.ledger.alle(),
      deps.vertragRepo.alle(),
      deps.zuordnungRepo.alle(),
      deps.freigabeRepo.alle(),
      deps.budgetRepo.alle(),
    ]);
  const zuordnungen_online = deps.kontozuordnungen ? await deps.kontozuordnungen() : [];

  const umsatzZuBuchung = belegZuBuchung(umsaetze);
  const rb = await ruecklagenbestandLaden(deps.ruecklagenRepo, deps.ruecklagenzuordnungRepo);
  const einordnungen = einordnungJeBuchung({ buchungen, kategorien, budgets, konten, zuordnungen, vertraege, ...rb });
  // Welche Anteile gerade auf eine Zuordnung warten — aus derselben Einordnung wie die Pille.
  const wartend = new Set<string>();
  for (const [id, liste] of einordnungen) for (const e of liste) if (e.wartetAuf) wartend.add(`${id}\u0000${e.kategorieId ?? ""}`);

  const freigegeben = freigegebenePaare(freigaben);

  return {
    konten, kategorien, regeln, umsaetze, laeufe, buchungen, vertraege, zuordnungen,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    kategorieNamen: new Map(kategorien.map((k) => [k.id, k.name])),
    umsatzZuBuchung,
    dublettenverdacht: ledgerVerdacht(umsaetze, new Set(buchungen.map((b) => b.id)), freigegeben),
    freigegeben,
    freigaben,
    einordnungen,
    onlineKonten: new Set(zuordnungen_online.map((z) => z.zahlungskontoId)),
    // Alle Rücklagen, beendete eingeschlossen: zur Wahl stehen nur laufende, aber eine
    // Zuordnung auf eine beendete soll ihren Namen zeigen. Ohne Wahl bleibt, was einem
    // Vertrag gehört — dort entscheidet die Zuordnung nichts (dieselbe Regel wie in der
    // Einordnung, `vertragId` zählt).
    ruecklagenwahl: ruecklagenwahlJeBuchung(
      buchungen, kategorien, alleRuecklagen(rb), rb.ruecklagenzuordnungen, wartend,
      new Set(zuordnungen.filter((z) => z.vertragId).map((z) => z.istbuchungId)),
    ),
  };
}
