// Übersetzung: was `lib-fints` liefert → `RohUmsatz`.
//
// Reine Funktionen, kein Netz, kein Zustand — hier laufen die Tests. Zwei der drei
// Fallen sind Invarianten-Kollisionen, die NICHT auffallen, wenn man sie falsch macht:
//
//  1. `amount` ist EURO als Fließkomma (`-102.55`), hier gilt Integer Cent.
//  2. Datumsfelder sind `Date`-Objekte auf LOKALER Mitternacht — in Mitteleuropa also
//     `…T22:00:00.000Z`. Ein naives `toISOString().slice(0,10)` liefert den VORTAG, bei
//     jeder Buchung, lautlos, und verschiebt damit jede Monatsgrenze mit.
//  3. Mehrere typisierte Felder (`remoteIdentifier`, `mandateReference`, `e2eReference`,
//     `bookingText`) bleiben LEER. Der Inhalt steckt im `purpose`-Freitext, in der
//     Schreibweise des Instituts. Das Herausparsen ist bankspezifisch und liegt deshalb
//     hinter einer eigenen Naht (`comdirectAnreicherung`): greift es nicht, fehlen
//     Zusatzfelder — die Übersetzung läuft trotzdem durch.

import { ibanGueltig, istCent, majorZuMinor, waehrungNachCode, type Cent, type Waehrung } from "../../core";
import type { RohUmsatz } from "../../application/import";

export const FINTS_QUELLE = "fints";

/**
 * Bank-Betrag (Major als Fließkomma) → Minor Units.
 *
 * Die Umrechnung selbst macht `majorZuMinor` aus dem Kern — sie kennt die Skala der
 * Währung (EUR 2, JPY 0, KWD 3) und rundet kaufmännisch. Hier kommt nur der Wächter
 * dazu: `-102.55 * 100` ist in IEEE 754 `-10254.999999999998`, und was danach kein
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

// ── Bankspezifische Naht: comdirects Klartext-Etiketten ───────────────────────────────
//
// Kein `CRED+`/`MREF+`/`SVWZ+` wie in der SEPA-Norm, sondern deutsche Etiketten OHNE
// Trennzeichen, direkt aneinandergeklebt:
//
//   LASTSCHRIFT / BELASTUNGHÄNDLER XY - EINZUG 806315
//   END-TO-END-REF.:8063154CORE / MANDATSREF.:648026GLÄUBIGER-ID:DE17ZZZ00000001797Ref. 5D2C2…
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
 * Buchungstext-Vokabular (MT940-Feld `:86:`, Subfeld `?00`), das comdirect vorn an den
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
   * comdirects eigene 16-stellige Referenz am Zweckende (`Ref. …`).
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
  // comdirect trennt Angaben mit „ / ", das am Wertende hängen bleibt.
  const s = (wert ?? "").replace(/[\s/]+$/, "").trim();
  return LEERWERTE.has(s.toUpperCase()) ? undefined : s || undefined;
}

/**
 * Zerlegt comdirects Zweck-Freitext. Reine Anreicherung: greift kein Muster, kommt der
 * Zweck unverändert zurück und alle Zusatzfelder bleiben leer.
 */
export function comdirectAnreicherung(purpose: string | undefined): Anreicherung {
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
  readonly valueDate: Date;
  readonly entryDate: Date;
  readonly amount: number;
  readonly purpose?: string;
  readonly remoteName?: string;
  readonly remoteAccountNumber?: string;
  readonly remoteBankId?: string;
  /** Typisiert, aber von lib-fints nie befüllt — trotzdem gelesen, falls es sich ändert. */
  readonly remoteIdentifier?: string;
  readonly mandateReference?: string;
  readonly bookingText?: string;
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
export function zuRohUmsatz(b: FintsBuchung, konto: KontoKontext): RohUmsatz {
  const a = comdirectAnreicherung(b.purpose);
  const waehrung = waehrungNachCode(konto.waehrung ?? "EUR");
  // MT940 füllt `remoteAccountNumber` je nach Bank mit einer IBAN ODER einer nationalen
  // Kontonummer. Nur was eine gültige IBAN ist, darf als solche weitergereicht werden —
  // der Konto-Match und `rohHash` normalisieren IBANs, eine Kontonummer würde dort
  // stillschweigend zu Müll.
  const gegenIban =
    b.remoteAccountNumber && ibanGueltig(b.remoteAccountNumber) ? b.remoteAccountNumber : undefined;
  return {
    buchungstag: isoDatum(b.entryDate),
    valuta: isoDatum(b.valueDate),
    betrag: bankbetragZuCent(b.amount, waehrung),
    waehrung: waehrung.code,
    gegenpartei: (b.remoteName ?? "").trim(),
    gegenparteiIban: gegenIban,
    verwendungszweck: a.zweck,
    kontoIban: konto.iban,
    kontoName: konto.name,
    glaeubigerId: b.remoteIdentifier?.trim() || a.glaeubigerId,
    istUmbuchung: false,
    quelle: FINTS_QUELLE,
  };
}
