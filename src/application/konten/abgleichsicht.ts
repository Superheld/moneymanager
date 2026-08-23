// Der Kontoabgleich — was WIR rechnen gegen das, was die BANK meldet.
//
// Die Frage steckte bisher als Pille in der Kontenliste: eine Zahl, die sagt „hier fehlen
// 600 Euro", ohne zu sagen, wo. Das ist die Auskunft, die man am wenigsten gebrauchen
// kann — sie beunruhigt und zeigt nicht hin.
//
// Hier steht dieselbe Frage ausgebreitet: je Konto die REIHE der Stichtage, an denen eine
// unabhängige Quelle etwas gemeldet hat, und je Abschnitt dazwischen, ob unsere Buchungen
// die Veränderung erklären. Wo sie es nicht tun, ist der Fehler in genau diesem Fenster
// entstanden.
//
// **Warum das nicht in der Kontenübersicht steht.** Der Auszug beantwortet „was ist
// passiert", der Abgleich „stimmt der Stand überhaupt". Das ist keine tägliche Frage,
// sondern eine, die man stellt, wenn etwas nicht aufgeht — und dann will man alles
// nebeneinander, nicht eine Pille am Rand.
//
// **Konten ohne Bank sind hier gleichberechtigt.** Ihre Anker kommen aus dem Kassensturz
// statt aus dem Abruf, und die Frage „stimmt mein Stand" ist dort genauso berechtigt; nur
// die Antwort kommt von Hand. Wer den Abgleich an die Bankzugänge hängt, sperrt sie aus.

import {
  abweichungsfenster,
  anfangsbestandAusAnker,
  ankerAbweichung,
  ankerFuer,
  istSummeBis,
  istSummeKonto,
  juengsterAnker,
  realerKontostand,
  type Abweichungsfenster,
  type Cent,
  type IstBuchung,
  type Kontostandsanker,
  type Zahlungskonto,
} from "../../core";
import type { KontostandsankerRepository, LedgerPort, ZahlungskontoRepository } from "../ports";
import type { Kontozuordnung } from "../fints/bankzugangPort";

/** Ein Stichtag mit beiden Zahlen nebeneinander. */
export interface Ankerpunkt {
  readonly anker: Kontostandsanker;
  /** Was unsere Buchungen bis zu diesem Tag ergeben (inkl. Anfangsbestand). */
  readonly gerechnet: Cent;
  /** Gemeldet minus gerechnet. Null heisst: an diesem Tag stimmte es. */
  readonly abweichung: Cent;
}

export interface Abgleichzeile {
  readonly konto: Zahlungskonto;
  /** Hängt das Konto an einer Bankverbindung? Entscheidet, woher Anker kommen können. */
  readonly online: boolean;
  /** Anfangsbestand — die Schätzung, die die Zeit vor dem ersten Import überbrückt. */
  readonly anfangsbestand: Cent;
  readonly bewegungen: Cent;
  /** Anfangsbestand + Bewegungen: was nach unserer Rechnung auf dem Konto liegt. */
  readonly gerechnet: Cent;
  /** Die Stichtage, aufsteigend. Leer, wenn nie etwas gemeldet wurde. */
  readonly punkte: readonly Ankerpunkt[];
  /** Der jüngste Stichtag — die aktuellste unabhängige Aussage. */
  readonly juengster?: Kontostandsanker;
  /** Abweichung am jüngsten Stichtag; fehlt, wenn es keinen gibt. */
  readonly abweichung?: Cent;
  /**
   * Wo es auseinanderläuft — zwischen welchen Stichtagen eine Veränderung nicht durch
   * Buchungen gedeckt ist. Leer heisst nicht „alles gut": es kann auch bedeuten, dass es
   * nur einen Anker gibt und damit kein Fenster.
   */
  readonly fenster: readonly Abweichungsfenster[];
  /**
   * Was der Anfangsbestand sein müsste, damit die Rechnung am jüngsten Anker aufgeht.
   *
   * Nur gesetzt, wenn es etwas zu ändern gibt. Der Vorschlag ist mit Vorsicht zu
   * behandeln: er schiebt die GESAMTE Differenz in die Vergangenheit, also auch das, was
   * ein echter Fehler von gestern ist. Richtig ist er nur, wenn die Differenz wirklich
   * aus der Zeit vor dem ersten Import stammt.
   */
  readonly anfangsbestandVorschlag?: Cent;
}

export interface AbgleichDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly ledger: LedgerPort;
  readonly ankerRepo: KontostandsankerRepository;
  readonly kontozuordnungen: () => Promise<readonly Kontozuordnung[]>;
}

export async function abgleichLaden(deps: AbgleichDeps): Promise<Abgleichzeile[]> {
  const [konten, buchungen, anker, zuordnungen] = await Promise.all([
    deps.kontoRepo.alle(),
    deps.ledger.alle(),
    deps.ankerRepo.alle(),
    deps.kontozuordnungen(),
  ]);

  const online = new Set(zuordnungen.map((z) => z.zahlungskontoId));
  return konten.map((konto) => abgleichZeile(konto, buchungen, anker, online.has(konto.id)));
}

function abgleichZeile(
  konto: Zahlungskonto,
  buchungen: readonly IstBuchung[],
  anker: readonly Kontostandsanker[],
  online: boolean,
): Abgleichzeile {
  const reihe = ankerFuer(anker, konto.id);
  const juengster = juengsterAnker(anker, konto.id);
  const abweichung = juengster ? ankerAbweichung(konto, [...buchungen], juengster) : undefined;

  const punkte = reihe.map((a): Ankerpunkt => {
    // Bis zum Stichtag, nicht insgesamt: ein Anker sagt etwas über SEINEN Tag, und was
    // danach gebucht wurde, gehört nicht in diesen Vergleich.
    const gerechnet = konto.saldo + istSummeBis(buchungen, konto.id, a.datum);
    return { anker: a, gerechnet, abweichung: a.betrag - gerechnet };
  });

  return {
    konto,
    online,
    anfangsbestand: konto.saldo,
    bewegungen: istSummeKonto([...buchungen], konto.id),
    gerechnet: realerKontostand(konto, [...buchungen]),
    punkte,
    juengster,
    abweichung,
    fenster: abweichungsfenster(buchungen, anker, konto.id),
    // Nur vorschlagen, wenn es etwas zu ändern gibt — sonst böte die Oberfläche eine
    // Handlung an, die nichts tut.
    anfangsbestandVorschlag:
      juengster && abweichung !== 0 ? anfangsbestandAusAnker([...buchungen], juengster) : undefined,
  };
}
