// Übersetzung: was `lib-fints` liefert → `RohUmsatz`.
//
// Reine Funktionen, kein Netz, kein Zustand — hier laufen die Tests. Zwei der drei
// Fallen sind Invarianten-Kollisionen, die NICHT auffallen, wenn man sie falsch macht:
//
//  1. `amount` ist EURO als Fließkomma (`-128.14`), hier gilt Integer Cent.
//  2. Datumsfelder sind `Date`-Objekte auf LOKALER Mitternacht — in Mitteleuropa also
//     `…T22:00:00.000Z`. Ein naives `toISOString().slice(0,10)` liefert den VORTAG, bei
//     jeder Buchung, lautlos, und verschiebt damit jede Monatsgrenze mit.
//  3. Welche typisierten Felder befüllt sind, hängt am FORMAT — und das hat sich am
//     2026-09-04 geändert. Bis dahin stand hier „bleiben LEER", und für CAMT stimmte das:
//     der Parser der Bibliothek las aus `Refs` nur `EndToEndId` und `MndtId`, die
//     Gläubiger-ID holte er nirgends ab. Bei MT940 stimmte es nie — dort werden `CRED+`
//     und `DEBT+` aus dem Verwendungszweck gelesen, seit jeher.
//
//     Seit dem Fork-Stand 27de365 liest auch der CAMT-Parser sie (`RltdPties.Cdtr` bzw.
//     `.Dbtr`). `bookingText` bleibt bei CAMT weiterhin leer.
//
//     Der eigene Parser (`klartextAnreicherung`) bleibt trotzdem: er fängt die
//     ausgeschriebene Schreibweise mancher Institute („GLÄUBIGER-ID:" im Freitext), die
//     keine SEPA-Tags trägt. Die typisierten Felder haben Vorrang — die Angabe der
//     Bibliothek ist die verlässlichere.

import { ibanGueltig, istCent, majorZuMinor, waehrungNachCode, type Cent, type Waehrung } from "../../core";
import type { RohSammelposten, RohUmsatz } from "../../application/import";
import type { Vormerkungszeile } from "../../application/fints/abrufPort";

export const FINTS_QUELLE = "fints";

/**
 * Bank-Betrag (Major als Fließkomma) → Minor Units.
 *
 * Die Umrechnung selbst macht `majorZuMinor` aus dem Kern — sie kennt die Skala der
 * Währung (EUR 2, JPY 0, KWD 3) und rundet kaufmännisch. Hier kommt nur der Wächter
 * dazu: `-128.14 * 100` ist in IEEE 754 `-12813.999999999998`, und was danach kein
 * sicherer Integer ist, darf gar nicht erst in die App. Lieber ein lauter Fehler als
 * ein stiller Zahlendreher im Geld.
 */
export function bankbetragZuCent(betrag: number, waehrung: Waehrung = waehrungNachCode("EUR")): Cent {
  if (!Number.isFinite(betrag)) throw new Error(`Betrag ist keine Zahl: ${betrag}`);
  const cent = majorZuMinor(betrag, waehrung);
  if (!istCent(cent)) throw new Error(`Betrag ergibt keinen gültigen Wert in Minor Units: ${betrag}`);
  return cent;
}

/**
 * `Date` → ISO-Datum „YYYY-MM-DD" über die LOKALEN Bestandteile.
 *
 * Nicht `toISOString()`: die Bank meint den Kalendertag, und das Date-Objekt steht auf
 * lokaler Mitternacht. In UTC gerechnet wäre das der Vortag.
 */
export function isoDatum(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error(`Kein gültiges Datum: ${String(d)}`);
  const j = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${j}-${m}-${t}`;
}

/** Der Ausschnitt eines Auszugs, auf den die Übersetzung angewiesen ist. */
export interface Auszug {
  readonly openingBalance?: { readonly date: Date; readonly currency: string; readonly value: number };
  readonly closingBalance?: { readonly date: Date; readonly currency: string; readonly value: number };
  /** Die Buchungen zwischen den beiden Salden — nur für die Summenprobe. */
  readonly transactions?: readonly { readonly amount: number }[];
}

/** Ein Stand, den die Bank im Auszug mitgeliefert hat — Datum und Betrag in Cent. */
export interface Auszugsstand {
  readonly datum: string;
  readonly betrag: Cent;
}

/**
 * Die Stände, die in den Auszügen stehen — Anfangs- UND Schlusssaldo jedes Auszugs.
 *
 * Beide, nicht nur der Schluss: der Anfangssaldo des ersten Auszugs ist der Stand VOR dem
 * abgefragten Zeitraum und damit der früheste, den die Bank überhaupt hergibt. Bei
 * lückenlosen Auszügen ist der Anfang des einen der Schluss des vorigen — die Dopplung
 * kostet nichts, weil ein Anker über (Konto, Datum, Herkunft) eindeutig ist.
 *
 * **Der Anfangssaldo wird nur genommen, wenn er VOR dem Schluss liegt.** Der Anlass ist
 * seit 2026-09-04 weg: der CAMT-Parser legte einen Anfangssaldo von NULL an, wenn die Bank
 * keinen mitschickte, mit dem Datum des Schlusssaldos — ungeprüft übernommen ein Anker „an
 * diesem Tag lag nichts auf dem Konto", der die gesamte Kontodeckung als Fehlbetrag
 * meldet. Der Fork erfindet nichts mehr, beide Salden sind jetzt schlicht optional.
 *
 * Die Prüfung bleibt trotzdem, und nicht aus Vorsicht: ein Anfangssaldo am SELBEN Tag wie
 * der Schluss sagt so oder so nichts — er ist entweder erfunden oder er wiederholt den
 * Schluss. Sie war nie nur die Abwehr gegen diesen einen Fehler.
 *
 * Ein Anfangssaldo, der auf denselben Tag fällt wie der Schluss, sagt ohnehin nichts: er
 * ist entweder erfunden oder er wiederholt den Schluss.
 *
 * NICHT übernommen werden `availableBalance` (`:64:`) und `forwardBalances` (`:65:`): das
 * eine ist der verfügbare Betrag und beantwortet eine andere Frage als „was lag auf dem
 * Konto", das andere sind Vorausvaluta — Aussagen über die Zukunft, keine Beobachtungen.
 */
export function auszugsStaende(
  statements: readonly Auszug[],
  warnungen: string[] = [],
): Auszugsstand[] {
  const staende = [];
  for (const s of statements) {
    const brauchbar = [s.closingBalance];
    if (s.openingBalance && s.closingBalance && s.openingBalance.date < s.closingBalance.date) {
      brauchbar.unshift(s.openingBalance);
    }
    for (const b of brauchbar) {
      if (!b) continue;
      try {
        staende.push({
          datum: isoDatum(b.date),
          // In CENT, nicht in Euro: die Übersetzung gehört in den Adapter, die
          // Anwendungsschicht bekommt Domänenwerte. Dieselbe Regel wie beim Saldo aus
          // `HKSAL` und bei jedem Buchungsbetrag.
          betrag: bankbetragZuCent(b.value, waehrungNachCode(b.currency)),
        });
      } catch (e) {
        // Ein unlesbarer Saldo kippt den Abruf nicht — die Buchungen sind das Wichtigere,
        // und ein fehlender Anker heisst nur, dass eine Prüfmöglichkeit fehlt.
        warnungen.push(`Auszugssaldo übersprungen: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return staende;
}

/**
 * Die Summenprobe: ergeben die Buchungen eines Auszugs die Veränderung, die seine Salden
 * behaupten?
 *
 * Ein Auszug trägt Anfangs- UND Schlusssaldo, und dazwischen die Buchungen. Damit prüft
 * er sich selbst — das ist keine Erfindung von uns, sondern der Grund, warum beide Salden
 * überhaupt im Format stehen. Wir haben beide Zahlen bisher nur als Anker gelesen und die
 * Probe nie gemacht.
 *
 * Warum sie sich lohnt: eine einzelne Zeile mit falschem Vorzeichen oder verschlucktem
 * Betrag ist im Bestand später **nicht mehr auffindbar**. Der Kontoabgleich zeigt sie als
 * konstanten Versatz, und ein konstanter Versatz sieht exakt so aus wie ein zu hoch
 * geschätzter Anfangsbestand — die beiden sind ohne einen Anker VOR dem Fehler nicht zu
 * trennen. Hier dagegen ist der Fehler auf einen Auszug eingegrenzt, und zwar in dem
 * Moment, in dem er entsteht.
 *
 * Zwei Auszüge werden bewusst ÜBERSPRUNGEN statt gemeldet:
 *
 *   • Ohne beide Salden gibt es nichts zu prüfen.
 *   • Fällt der Anfangssaldo auf denselben Tag wie der Schluss, ist er nach derselben
 *     Regel wie in `auszugsStaende` unbrauchbar: der CAMT-Parser der Bibliothek erfindet
 *     in dem Fall eine Null. Gegen eine erfundene Null geprüft, meldete die Probe bei
 *     JEDEM solchen Auszug den vollen Kontostand als Lücke — ein Wächter, der immer
 *     anschlägt, wird abgeschaltet.
 *
 * Ebenso übersprungen wird ein Auszug, dessen Salden in verschiedenen Währungen stehen:
 * deren Differenz ist keine Zahl, die etwas bedeutet.
 */
export interface Auszugsprobe {
  readonly datum: string;
  /** Schluss minus Anfang — was die Bank an Veränderung behauptet. */
  readonly gemeldet: Cent;
  /** Summe der Buchungen des Auszugs. */
  readonly gebucht: Cent;
  /** gemeldet minus gebucht. Nie 0 — ein stimmiger Auszug erzeugt keine Probe. */
  readonly luecke: Cent;
  readonly buchungen: number;
}

export function auszugsProben(statements: readonly Auszug[]): Auszugsprobe[] {
  const proben: Auszugsprobe[] = [];
  for (const s of statements) {
    const { openingBalance: anfang, closingBalance: schluss } = s;
    if (!anfang || !schluss) continue;
    if (!(anfang.date < schluss.date)) continue;
    if (anfang.currency !== schluss.currency) continue;

    try {
      const waehrung = waehrungNachCode(schluss.currency);
      const gemeldet = bankbetragZuCent(schluss.value, waehrung) - bankbetragZuCent(anfang.value, waehrung);
      let gebucht = 0;
      for (const t of s.transactions ?? []) gebucht += bankbetragZuCent(t.amount, waehrung);
      if (gemeldet === gebucht) continue;
      proben.push({
        datum: isoDatum(schluss.date),
        gemeldet,
        gebucht,
        luecke: gemeldet - gebucht,
        buchungen: s.transactions?.length ?? 0,
      });
    } catch {
      // Ein unlesbarer Betrag macht die Probe unmöglich, nicht falsch. Er wird an anderer
      // Stelle schon gemeldet (`auszugsStaende`, `zuRohUmsatz`); hier ihn ein zweites Mal
      // zu melden hiesse, denselben Fehler doppelt zu zählen.
      continue;
    }
  }
  return proben;
}

// ── Depot: MT535-Aufstellung → Bestand ────────────────────────────────────────────────────
//
// Anders als bei den Umsätzen gibt es hier keine Naht zu einem bestehenden Modell: ein
// Depot hat keine Buchungen. Was ankommt, ist eine Beobachtung zu einem Stichtag, und die
// Übersetzung besteht im Wesentlichen aus zwei Entscheidungen — welche Zahl Geld ist und
// welche nicht, und welcher Tag gemeint ist.

/**
 * Der Stichtag einer Aufstellung.
 *
 * MT535 trägt das Datum an den POSITIONEN, nicht an der Aufstellung. Genommen wird das
 * späteste — es ist der Stand, den die Bank insgesamt meldet. Fehlt es überall, gilt der
 * Abruftag: das ist die Aussage, die die Bank gerade gemacht hat.
 */
export function depotStichtag(daten: readonly (Date | undefined)[], abruftag: string): string {
  const tage = daten.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  if (tage.length === 0) return abruftag;
  const sortiert = tage.map(isoDatum).sort();
  return sortiert[sortiert.length - 1];
}

/**
 * Eine Position der Bank → unsere.
 *
 * `wert` geht durch `bankbetragZuCent` wie jeder Betrag. `stueck` und `kurs` NICHT: das
 * eine ist eine Menge (Fondsanteile haben Nachkommastellen), das andere eine Notierung,
 * die in Cent gepresst still an Genauigkeit verlöre. Beide werden angezeigt, nie summiert
 * — die Summen kommen aus `wert`.
 */
export function zuDepotposition(
  h: {
    isin?: string;
    wkn?: string;
    name?: string;
    amount?: number;
    price?: number;
    value?: number;
    currency?: string;
    acquisitionDate?: Date;
    acquisitionPrice?: number;
  },
  standardWaehrung?: string,
): DepotpositionRoh {
  const waehrung = h.currency ?? standardWaehrung;
  return {
    isin: h.isin,
    wkn: h.wkn,
    name: h.name,
    stueck: h.amount,
    kurs: h.price,
    wert: h.value == null ? undefined : bankbetragZuCent(h.value, waehrungNachCode(waehrung ?? "EUR")),
    waehrung,
    einstandDatum: h.acquisitionDate ? isoDatum(h.acquisitionDate) : undefined,
    einstandKurs: h.acquisitionPrice,
  };
}

/** Die Form, die `zuDepotposition` liefert — deckungsgleich mit `Depotposition` im Port. */
interface DepotpositionRoh {
  isin?: string;
  wkn?: string;
  name?: string;
  stueck?: number;
  kurs?: number;
  wert?: Cent;
  waehrung?: string;
  einstandDatum?: string;
  einstandKurs?: number;
}

// ── Bankspezifische Naht: Klartext-Etiketten statt SEPA-Tags ───────────────────────────────
//
// Kein `CRED+`/`MREF+`/`SVWZ+` wie in der SEPA-Norm, sondern deutsche Etiketten OHNE
// Trennzeichen, direkt aneinandergeklebt:
//
//   LASTSCHRIFT / BELASTUNGHÄNDLER XY - EINZUG 400271
//   END-TO-END-REF.:4002713CORE / MANDATSREF.:517390GLÄUBIGER-ID:DE98ZZZ09999999901Ref. 5D2C2…
//
// Weil es keine Trennzeichen gibt, endet ein Wert dort, wo das nächste bekannte Etikett
// beginnt. Deshalb wird nicht mit verschachtelten Regex gearbeitet, sondern die Etiketten
// werden gesucht und der Text an ihren Positionen zerlegt.

/** Bekannte Etiketten. Reihenfolge egal — zerlegt wird nach Fundposition. */
const ETIKETTEN = [
  "END-TO-END-REF.:",
  "MANDATSREF.:",
  "GLÄUBIGER-ID:",
  "KUNDENREFERENZ:",
  "KARTE NR.",
  "Ref. ",
] as const;

/**
 * Buchungstext-Vokabular (MT940-Feld `:86:`, Subfeld `?00`), das solche Banken vorn an den
 * Verwendungszweck klebt. Unvollständig und darf es sein: was nicht erkannt wird, bleibt
 * einfach Teil des Verwendungszwecks.
 */
const BUCHUNGSTEXTE = [
  "LASTSCHRIFT / BELASTUNG",
  "ÜBERTRAG / ÜBERWEISUNG",
  "KARTENVERFÜGUNG",
  "KARTENZAHLUNG",
  "KONTOÜBERTRAG",
  "GUTSCHRIFT",
  "ÜBERWEISUNG",
  "DAUERAUFTRAG",
  "ENTGELTABSCHLUSS",
  "ZINS-/KONTOABSCHLUSS",
] as const;

/** Werte, die die Bank als „kein Wert" schreibt. */
const LEERWERTE = new Set(["NICHT ANGEGEBEN", "NOTPROVIDED", "NONREF", ""]);

export interface Anreicherung {
  /** Verwendungszweck ohne Buchungstext und ohne die Etiketten-Anhänge. */
  readonly zweck: string;
  readonly buchungstext?: string;
  readonly glaeubigerId?: string;
  readonly mandatsreferenz?: string;
  readonly e2eReferenz?: string;
  /**
   * die institutseigene 16-stellige Referenz am Zweckende (`Ref. …`).
   *
   * ABSICHTLICH NICHT als `nativeId` verwendet: im Spike trugen 64 von 65 Buchungen eine,
   * davon aber nur 59 verschiedene — und ob sie über mehrere Abrufe hinweg stabil bleibt,
   * ist ungeprüft. Eine instabile oder mehrfach vergebene ID wäre schlimmer als keine:
   * die Dedup würde echte Buchungen verwerfen. Bleibt Anzeige-/Diagnosewert, bis ein
   * zweiter Abruf desselben Zeitraums die Stabilität belegt.
   */
  readonly bankreferenz?: string;
}

function saeubern(wert: string | undefined): string | undefined {
  // Solche Banken trennen Angaben mit „ / ", das am Wertende hängen bleibt.
  const s = (wert ?? "").replace(/[\s/]+$/, "").trim();
  return LEERWERTE.has(s.toUpperCase()) ? undefined : s || undefined;
}

/**
 * Zerlegt den Zweck-Freitext solcher Banken. Reine Anreicherung: greift kein Muster, kommt der
 * Zweck unverändert zurück und alle Zusatzfelder bleiben leer.
 */
export function klartextAnreicherung(purpose: string | undefined): Anreicherung {
  const text = (purpose ?? "").trim();
  if (!text) return { zweck: "" };

  let rest = text;
  let buchungstext: string | undefined;
  const treffer = BUCHUNGSTEXTE.find((b) => rest.toUpperCase().startsWith(b));
  if (treffer) {
    buchungstext = treffer;
    rest = rest.slice(treffer.length).trim();
  }

  // Alle Etiketten mit ihrer Position suchen und nach Position sortieren.
  const funde: { etikett: string; start: number; ende: number }[] = [];
  for (const e of ETIKETTEN) {
    let ab = 0;
    for (;;) {
      const i = rest.indexOf(e, ab);
      if (i < 0) break;
      funde.push({ etikett: e, start: i, ende: i + e.length });
      ab = i + e.length;
    }
  }
  funde.sort((a, b) => a.start - b.start);

  const werte = new Map<string, string>();
  for (let i = 0; i < funde.length; i++) {
    const f = funde[i];
    const bis = i + 1 < funde.length ? funde[i + 1].start : rest.length;
    if (!werte.has(f.etikett)) werte.set(f.etikett, rest.slice(f.ende, bis).trim());
  }

  const zweck = (funde.length > 0 ? rest.slice(0, funde[0].start) : rest).trim();

  return {
    zweck,
    buchungstext,
    glaeubigerId: saeubern(werte.get("GLÄUBIGER-ID:")),
    mandatsreferenz: saeubern(werte.get("MANDATSREF.:")),
    e2eReferenz: saeubern(werte.get("END-TO-END-REF.:")),
    bankreferenz: saeubern(werte.get("Ref. ")),
  };
}

// ── Die eigentliche Übersetzung ───────────────────────────────────────────────────────

/** Der Ausschnitt von `Transaction` (lib-fints), auf den die Übersetzung angewiesen ist. */
export interface FintsBuchung {
  /**
   * BEIDE Daten sind seit dem CAMT-Ausbau der Bibliothek optional, und zwar für genau
   * einen Fall: eine noch nicht gebuchte CAMT-Zeile, der die Bank überhaupt kein Datum
   * mitgibt (bei comdirect gemessen). Solche Zeilen stehen im ZWEITEN Feld der Antwort
   * (`notedStatements`), das wir nicht lesen — hier kommt also keine an. Die Schnittstelle
   * bildet die Bibliothek trotzdem ehrlich ab: eine Kopie, die mehr zusichert als das
   * Original, verschweigt beim nächsten Bump genau die Änderung, wegen der es sie gibt.
   */
  readonly valueDate?: Date;
  /** Siehe {@link valueDate}. */
  readonly entryDate?: Date;
  readonly amount: number;
  readonly purpose?: string;
  readonly remoteName?: string;
  /** Was das Format gerade hergibt: in CAMT die IBAN, in MT940 die Kontonummer aus `?31`. */
  readonly remoteAccountNumber?: string;
  /**
   * Wo die Bank AUSDRÜCKLICH eine IBAN nennt — CAMT immer, MT940 im Unterfeld `?38`.
   * Getrennt von `remoteAccountNumber`, weil dort beides stehen kann und keine Angabe
   * sagt, welches.
   */
  readonly remoteIban?: string;
  readonly remoteBankId?: string;
  /** Geschäftsvorfallcode (MT940 `:61:`), z. B. 005, 700, 820. */
  readonly transactionCode?: string;
  /** Typisiert, aber von lib-fints nie befüllt — trotzdem gelesen, falls es sich ändert. */
  readonly remoteIdentifier?: string;
  readonly mandateReference?: string;
  readonly e2eReference?: string;
  readonly bookingText?: string;
  /** SEPA-Verwendungszweckcode (`SALA`, `RENT` …) — nur CAMT. */
  readonly purposeCode?: string;
  /** Der Empfänger hinter einem Zahlungsdienstleister — nur CAMT. */
  readonly ultimateParty?: string;
  /** `NtryRef` — die Referenz der Bank für den Eintrag, neben `bankReference`. Nur CAMT. */
  readonly entryReference?: string;
  /** `BkTxCd.Prtry.Cd` — SWIFT-Typ und Geschäftsvorfallcode in einem. Nur CAMT. */
  readonly proprietaryCode?: string;
  /** `Refs.TxId` — die Transaktionskennung der Bank. Nur CAMT. */
  readonly transactionId?: string;
  /** `RmtInf.Strd.CdtrRefInf.Ref` — die strukturierte Referenz (ISO 11649). Nur CAMT. */
  readonly creditorReference?: string;
  /** Die Zahlungen hinter einer Sammelbuchung — nur gesetzt, wo es MEHRERE sind. Nur CAMT. */
  readonly details?: readonly FintsSammelposten[];
  /** `BOOK` / `PDNG` / `INFO` — ob die Bank gebucht hat (`Sts`). Nur CAMT. */
  readonly status?: string;
  /** Ob die Zeile eine frühere aufhebt (`RvslInd`). Nur CAMT. */
  readonly isReversal?: boolean;
  /** Was die Bank für die Buchung genommen hat (`Chrgs`). Nur CAMT. */
  readonly charges?: FintsGeld;
  /** Der Betrag vor der Umrechnung (`AmtDtls.InstdAmt`) und sein Kurs. Nur CAMT. */
  readonly originalAmount?: FintsGeld;
  readonly exchangeRate?: number;
  /** Warum eine Zahlung zurückkam (`RtrInf`). Nur CAMT. */
  readonly returnReason?: { readonly code?: string; readonly text?: string };
  /** MT940 die Kundenreferenz aus `:61:`, CAMT die E2E-Referenz. */
  readonly customerReference?: string;

  // ── Ab hier: was ohne eigene Aussage in `bankfelder` wandert ────────────────────────
  /** SWIFT-Buchungsart (MT940 `:61:`), etwa `NTRF`, `NMSC`. */
  readonly transactionType?: string;
  /** Soll/Haben-Kennzeichen der Buchung. */
  readonly fundsCode?: string;
  /** Primanotennummer (MT940 `?10`). */
  readonly primeNotesNr?: string;
  /** Auftraggeberkennung (MT940 `?30`-Umfeld). */
  readonly client?: string;
  /** Textschlüsselergänzung (MT940). */
  readonly textKeyExtension?: string;
  /** Bezugsreferenz des Auszugs. */
  readonly relatedReference?: string;
  /** Der Kopf einer Sammelbuchung (`NtryDtls.Btch`) — wie viele Zahlungen darin stecken. */
  readonly batch?: {
    readonly messageId?: string;
    readonly paymentInformationId?: string;
    readonly numberOfTransactions?: number;
  };
}

/** Ein Geldbetrag, wie die Bibliothek ihn liefert: Euro als Fliesskomma plus Währung. */
export interface FintsGeld {
  readonly value: number;
  readonly currency?: string;
}

/**
 * Ein Nebenbetrag der Bank in Minor Units — oder `undefined`, wenn er sich nicht sicher
 * umrechnen lässt.
 *
 * **Wirft nicht.** Gebühr und Originalbetrag stehen NEBEN dem Betrag der Buchung, und der
 * kommt von der Bank und stimmt. Eine unbrauchbare Nebenangabe darf die Zeile nicht
 * mitnehmen — dieselbe Abwägung wie bei den Sammelposten.
 */
function nebenbetrag(geld: FintsGeld | undefined, konto: Waehrung): { betrag?: Cent; waehrung?: string } {
  if (!geld) return {};
  const waehrung = geld.currency ? waehrungNachCode(geld.currency) : konto;
  try {
    return { betrag: bankbetragZuCent(geld.value, waehrung), waehrung: waehrung.code };
  } catch {
    return { waehrung: waehrung.code };
  }
}

/**
 * Was die Bank sonst noch sagte — die Felder ohne eigene Aussage, unter ihren Namen aus
 * der Bibliothek.
 *
 * Leere und fehlende Werte fallen weg: ein Feld, das nichts trägt, ist keine Angabe, und
 * ein Objekt voller `undefined` wäre beim Nachsehen schlechter als keines.
 */
function bankfelderAus(b: FintsBuchung): Record<string, unknown> | undefined {
  const raus: Record<string, unknown> = {};
  const text = (wert: string | undefined) => wert?.trim() || undefined;
  const eintraege: [string, unknown][] = [
    ["transactionType", text(b.transactionType)],
    ["fundsCode", text(b.fundsCode)],
    ["primeNotesNr", text(b.primeNotesNr)],
    ["client", text(b.client)],
    ["textKeyExtension", text(b.textKeyExtension)],
    ["relatedReference", text(b.relatedReference)],
    ["batch", b.batch && Object.values(b.batch).some((v) => v !== undefined) ? b.batch : undefined],
  ];
  for (const [name, wert] of eintraege) if (wert !== undefined) raus[name] = wert;
  return Object.keys(raus).length > 0 ? raus : undefined;
}

/** Eine Zahlung aus `Transaction.details` (lib-fints), im Ausschnitt, den wir lesen. */
export interface FintsSammelposten {
  /** Vorzeichenbehaftet wie der Betrag der Buchung; fehlt, wo die Bank nur die Summe nennt. */
  readonly amount?: { readonly value: number; readonly currency?: string };
  readonly remoteName?: string;
  readonly remoteIban?: string;
  readonly remoteIdentifier?: string;
  readonly ultimateParty?: string;
  readonly purpose?: string;
  readonly purposeCode?: string;
  readonly mandateReference?: string;
  readonly e2eReference?: string;
  readonly transactionId?: string;
  readonly creditorReference?: string;
}

/**
 * Eine Zahlung hinter einer Sammelbuchung → `RohSammelposten`.
 *
 * **Ein unbrauchbarer Betrag laesst den Posten ohne Betrag stehen, statt zu werfen.** Die
 * Posten sind Beiwerk: der Betrag der BUCHUNG kommt von der Bank und stimmt, und eine
 * Nebenangabe darf die Zeile nicht mitnehmen. Was am Posten trotzdem dasteht — Empfaenger,
 * Zweck, Referenzen — ist dann immer noch mehr als nichts.
 */
function zuSammelposten(d: FintsSammelposten, kontoWaehrung: Waehrung): RohSammelposten {
  const waehrung = d.amount?.currency ? waehrungNachCode(d.amount.currency) : kontoWaehrung;
  let betrag: Cent | undefined;
  if (d.amount) {
    try {
      betrag = bankbetragZuCent(d.amount.value, waehrung);
    } catch {
      betrag = undefined;
    }
  }
  return {
    betrag,
    gegenpartei: d.remoteName?.trim() || undefined,
    gegenparteiIban:
      d.remoteIban && ibanGueltig(d.remoteIban) ? d.remoteIban : undefined,
    endempfaenger: d.ultimateParty?.trim() || undefined,
    verwendungszweck: d.purpose?.trim() || undefined,
    zweckCode: d.purposeCode?.trim() || undefined,
    glaeubigerId: d.remoteIdentifier?.trim() || undefined,
    mandatsreferenz: d.mandateReference?.trim() || undefined,
    e2eReferenz: d.e2eReference?.trim() || undefined,
    transaktionsId: d.transactionId?.trim() || undefined,
    strukturierteReferenz: d.creditorReference?.trim() || undefined,
  };
}

export interface KontoKontext {
  readonly iban?: string;
  readonly name?: string;
  readonly waehrung?: string;
}

/**
 * Eine Bank-Buchung → `RohUmsatz`.
 *
 * `nativeId` bleibt bewusst LEER: FinTS liefert hier keine stabile Buchungs-ID.
 * `customerReference` ist durchgehend `NONREF`, und `bankReference` (`POS 54`, `POS 53`, …)
 * ist ein absteigender Zähler über das ABGEFRAGTE FENSTER — dieselbe Buchung trägt beim
 * nächsten Abruf eine andere Nummer. Die Dedup läuft damit allein über `rohHash`.
 *
 * `istUmbuchung` bleibt false: FinTS weiß nichts über die anderen Konten des Nutzers.
 * Die Umbuchungs-Paarung ist Sache der bestehenden Erkennung eine Schicht höher.
 */
/**
 * Eine gemeldete Vormerkung → die Form, in der die Anwendung sie annimmt.
 *
 * **Ein eigener Weg neben `zuRohUmsatz`, und das ist Absicht.** Eine Vormerkung ist keine
 * Zahlung, sondern eine Beobachtung mit Verfallsdatum; sie durch dieselbe Übersetzung zu
 * schicken hiesse, sie mit allem auszustatten, was eine Buchung braucht — Dedup-Schlüssel,
 * Kontozuordnung, Kategorievorschlag — und nichts davon ergibt für sie einen Sinn. Was
 * hier ankommt, ist das, was man anzeigen und rechnen kann.
 *
 * **`entryDate` darf fehlen und wirft hier NICHT.** Genau das ist der Fall, für den die
 * Bibliothek beide Datumsfelder optional gemacht hat: eine noch nicht gebuchte CAMT-Zeile
 * kann ganz ohne Datum kommen. Bei einer Buchung wäre das ein Grund, die Zeile
 * abzuweisen; bei einer Vormerkung ist es eine ohne Termin, und die ist mehr wert als
 * keine.
 */
export function zuVormerkung(b: FintsBuchung, kontoWaehrung?: string): Vormerkungszeile {
  const waehrung = waehrungNachCode(kontoWaehrung ?? "EUR");
  const a = klartextAnreicherung(b.purpose);
  const tag = b.entryDate ?? b.valueDate;
  return {
    datum: tag ? isoDatum(tag) : undefined,
    betrag: bankbetragZuCent(b.amount, waehrung),
    waehrung: waehrung.code,
    gegenpartei: (b.remoteName ?? "").trim(),
    verwendungszweck: a.zweck,
    buchungsstand: b.status?.trim() || undefined,
  };
}

export function zuRohUmsatz(b: FintsBuchung, konto: KontoKontext): RohUmsatz {
  const a = klartextAnreicherung(b.purpose);
  const waehrung = waehrungNachCode(konto.waehrung ?? "EUR");
  // ZWEI FELDER FÜR EINE FRAGE, und die Reihenfolge ist der Punkt.
  //
  // `remoteIban` steht da, wo die Bank ausdrücklich eine IBAN nennt — CAMT tut das immer,
  // MT940 im Unterfeld `?38`. Es hat Vorrang, weil es eine Zusage ist und keine Deutung.
  //
  // `remoteAccountNumber` trägt dagegen, was das Format gerade hergibt: in CAMT die IBAN,
  // in MT940 die nationale Kontonummer aus `?31`. Beides landet in derselben Eigenschaft,
  // und keine Angabe sagt, welches von beiden. Deshalb die Prüfung — der Konto-Match und
  // `rohHash` normalisieren IBANs, eine Kontonummer würde dort stillschweigend zu Müll.
  const original = nebenbetrag(b.originalAmount, waehrung);
  const gebuehr = nebenbetrag(b.charges, waehrung);
  const gegenIban =
    b.remoteIban && ibanGueltig(b.remoteIban)
      ? b.remoteIban
      : b.remoteAccountNumber && ibanGueltig(b.remoteAccountNumber)
        ? b.remoteAccountNumber
        : undefined;
  // Ein Buchungstag ist Pflicht, eine Valuta nicht — und das ist keine Bequemlichkeit,
  // sondern der Unterschied zwischen den beiden Feldern in `RohUmsatz`. Ohne Buchungstag
  // lässt sich die Zeile nicht bilden; der Wurf landet in der Schleife des Adapters und
  // wird zur Warnung „Buchung übersprungen", statt den ganzen Abruf zu kippen.
  if (!b.entryDate) throw new Error("Die Bank hat zu dieser Buchung keinen Buchungstag geliefert");
  return {
    buchungstag: isoDatum(b.entryDate),
    valuta: b.valueDate ? isoDatum(b.valueDate) : undefined,
    betrag: bankbetragZuCent(b.amount, waehrung),
    waehrung: waehrung.code,
    gegenpartei: (b.remoteName ?? "").trim(),
    gegenparteiIban: gegenIban,
    verwendungszweck: a.zweck,
    kontoIban: konto.iban,
    kontoName: konto.name,
    glaeubigerId: b.remoteIdentifier?.trim() || a.glaeubigerId,
    // Von der Bank wird alles weggespeichert, was strukturiert ankommt. Die typisierten
    // Felder haben Vorrang vor dem Geparsten — heute füllt lib-fints sie nie, aber wenn
    // sich das ändert, ist die Angabe der Bibliothek die verlässlichere.
    mandatsreferenz: b.mandateReference?.trim() || a.mandatsreferenz,
    e2eReferenz: b.e2eReference?.trim() || a.e2eReferenz,
    // ACHTUNG, DIESE BEIDEN SIND FORMATABHÄNGIG — derselbe Feldname trägt je nach
    // Abrufweg etwas anderes:
    //
    //   umsatzart          MT940: `?00`, ein kurzes Etikett („SEPA-LASTSCHRIFT")
    //                      CAMT:  `AddtlNtryInf`, ein Freitext der Bank
    //   buchungsschluessel MT940: der DK-Geschäftsvorfallcode, NUMERISCH
    //                      CAMT:  `SubFmlyCd`, ALPHABETISCH
    //
    // Sie werden trotzdem in dieselbe Spalte geschrieben, und das ist eine bewusste,
    // unfertige Entscheidung: eine Abbildung zwischen beiden Vokabularen liesse sich nur
    // aus der DK-Spezifikation gewinnen, und eine geratene wäre schlimmer als keine.
    //
    // Deutbar bleibt der Wert trotzdem, denn das Format steht am LAUF (`import_lauf`),
    // und jede Zeile gehört zu genau einem. Wer die Werte auswertet — allen voran die
    // Kategorie-Erkennung —, muss danach unterscheiden; sonst lernt sie zwei getrennte
    // Merkmalsräume für dieselbe Sache, ohne dass irgendwo ein Fehler auftaucht.
    umsatzart: b.bookingText?.trim() || a.buchungstext,
    buchungsschluessel: b.transactionCode?.trim() || undefined,
    // Zwei Einordnungen, die die BANK schon vorgenommen hat und die wir nicht besser
    // nachbauen könnten. Nur CAMT liefert sie; bei MT940 bleiben sie leer, und das ist
    // eine ehrliche Lücke und kein Grund, etwas zu erfinden.
    zweckCode: b.purposeCode?.trim() || undefined,
    endempfaenger: b.ultimateParty?.trim() || undefined,
    // VIER ANGABEN, DIE HEUTE NICHTS AUSWERTET, und die trotzdem mitkommen. Der Grund
    // ist nicht Sammelwut: ein Institut hält Umsätze nur eine begrenzte Zeit vor. Was
    // jetzt nicht abgeholt wird, ist für die Vergangenheit nicht nachzuholen, während
    // eine Spalte, die wartet, nichts kostet — dieselbe Überlegung wie bei der
    // Jahresstufe der Sicherungen. Wofür jede gut sein könnte, steht an `RohUmsatz`.
    eintragReferenz: b.entryReference?.trim() || undefined,
    bankBuchungscode: b.proprietaryCode?.trim() || undefined,
    transaktionsId: b.transactionId?.trim() || undefined,
    strukturierteReferenz: b.creditorReference?.trim() || undefined,
    // Die Zahlungen hinter einer Sammelbuchung. Sie stehen nur da, wo es MEHRERE sind —
    // bei einer einzelnen tragen die Felder oben ihre Angaben, wie immer. Eine leere
    // Liste wird zu `undefined`: „kein Sammelposten" und „eine Sammelbuchung ohne
    // Zahlungen darin" sind nicht dasselbe, und das zweite gibt es nicht.
    sammelposten:
      b.details && b.details.length > 0
        ? b.details.map((d) => zuSammelposten(d, waehrung))
        : undefined,
    // Was die Bank ueber die Zahlung SAGT, jenseits von Betrag und Text. Nichts davon
    // wertet heute etwas aus; es kommt mit, weil ein Institut Umsaetze nur begrenzt
    // vorhaelt und die Angabe danach nirgends mehr steht.
    buchungsstand: b.status?.trim() || undefined,
    istStorno: b.isReversal,
    originalBetrag: original.betrag,
    originalWaehrung: original.betrag === undefined ? undefined : original.waehrung,
    wechselkurs: Number.isFinite(b.exchangeRate) ? b.exchangeRate : undefined,
    gebuehrBetrag: gebuehr.betrag,
    gebuehrWaehrung: gebuehr.betrag === undefined ? undefined : gebuehr.waehrung,
    ruecklaufCode: b.returnReason?.code?.trim() || undefined,
    ruecklaufText: b.returnReason?.text?.trim() || undefined,
    // FORMATABHAENGIG: MT940 die Kundenreferenz aus `:61:` (dort haeufig `NONREF`),
    // CAMT die E2E-Referenz. Deutbar allein ueber das Format am Lauf.
    kundenreferenz: b.customerReference?.trim() || undefined,
    bankfelder: bankfelderAus(b),
    bankreferenz: a.bankreferenz,
    istUmbuchung: false,
    quelle: FINTS_QUELLE,
  };
}
