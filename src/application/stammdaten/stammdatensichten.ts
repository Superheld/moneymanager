// Stammdaten-Sichten — Personen, Konten, Kategorien und was sich daraus ergibt.
//
// Die Kontostände stehen hier und nicht in der Oberfläche, obwohl sie einzeilig sind:
// `realerKontostand` und `istSummeKonto` gehen beide über den ganzen Buchungsbestand,
// treffen also eine Auswahl — und Auswahl ist per Hausregel (CLAUDE.md) Sache der
// Anwendungsschicht. Der Screen bekommt Zahlen, keine Rohteile.
//
// Das ist nicht Prinzipienreiterei: dieselbe Bauart hat beim Budgetverbrauch dazu
// geführt, dass zwei Screens dieselbe Frage verschieden beantworteten.

import {
  istSummeKonto,
  realerKontostand,
  type Cent,
  type Kategorie,
  type Person,
  type Zahlungskonto,
} from "../../core";
import type {
  KategorieRepository,
  LedgerPort,
  PersonRepository,
  ZahlungskontoRepository,
} from "../ports";

export interface StammdatenDeps {
  readonly personRepo: PersonRepository;
  readonly kontoRepo: ZahlungskontoRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly ledger: LedgerPort;
}

/** Ein Konto mit seinen beiden Zahlen — beide über den ganzen Bestand gerechnet. */
export interface Kontostand {
  readonly konto: Zahlungskonto;
  /**
   * Summe aller gebuchten Bewegungen. Hiess in der Oberfläche lange „Σ Ist" — ein Name,
   * der ausserhalb des Codes nichts bedeutete.
   */
  readonly bewegungen: Cent;
  /** Anfangsbestand + Bewegungen. Das, was tatsächlich auf dem Konto liegt. */
  readonly realerStand: Cent;
}

export interface Stammdaten {
  readonly personen: readonly Person[];
  readonly konten: readonly Zahlungskonto[];
  readonly kategorien: readonly Kategorie[];
  readonly kontostaende: readonly Kontostand[];
  /**
   * Gibt es überhaupt gebuchte Bewegungen (Import oder abgehakter Plan)?
   *
   * Daran hängt, ob die Kontenliste den Wert als „Anfangsbestand" oder schlicht als
   * „Kontostand" beschriftet: ohne Bewegungen IST der Anfangsbestand der Kontostand,
   * und zwei Zahlenspalten daneben wären leer.
   */
  readonly hatGebuchtes: boolean;
}

export async function stammdatenLaden(deps: StammdatenDeps): Promise<Stammdaten> {
  const [personen, konten, kategorien, buchungen] = await Promise.all([
    deps.personRepo.alle(),
    deps.kontoRepo.alle(),
    deps.kategorieRepo.alle(),
    deps.ledger.alle(),
  ]);
  return {
    personen,
    konten,
    kategorien,
    hatGebuchtes: buchungen.some((b) => b.quelle === "import"),
    kontostaende: konten.map((konto) => ({
      konto,
      bewegungen: istSummeKonto(buchungen, konto.id),
      realerStand: realerKontostand(konto, buchungen),
    })),
  };
}
