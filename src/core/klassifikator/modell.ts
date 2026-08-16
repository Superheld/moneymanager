// Der Klassifikator — multinomiale logistische Regression über die Merkmale aus
// `merkmale.ts`. Reine Funktionen, kein IO, keine Abhängigkeiten.
//
// Warum ausgerechnet diese Modellklasse, und keine größere: Der Lern-Spike (2026-06) hat
// linear, MLP und tief+breit auf denselben Daten verglichen — sie lagen gleichauf, der
// Deckel bei ~85 % ist daten- und mehrdeutigkeitslimitiert. Ein Hidden Layer kostet also
// Rechenzeit und Erklärbarkeit, ohne etwas zu bringen.
//
// Und die Erklärbarkeit ist hier kein Beiwerk. Bei einem linearen Modell IST die
// Begründung das Modell: der Score einer Kategorie ist die Summe der Gewichte ihrer
// Tokens, also lässt sich jede Entscheidung in „woran lag es" zerlegen — ohne Näherung,
// ohne zweites Verfahren daneben. Genau das trägt später die Anzeige „warum diese
// Kategorie?" und die Frage, ob man dem Vorschlag glaubt.
//
// Determinismus ist Absicht: gleiche Beispiele, gleiche Optionen ⇒ gleiches Modell, Bit
// für Bit. Das Mischen der Trainingsreihenfolge läuft über einen eigenen, gesetzten
// Zufallsgenerator statt über `Math.random`. Sonst lieferte zweimal „Training starten"
// zwei verschiedene Modelle, und keine Messung wäre wiederholbar.

/** Ein Trainingsbeispiel: Tokens plus die Kategorie, die herauskommen soll. */
export interface Beispiel {
  readonly merkmale: readonly string[];
  readonly kategorieId: string;
}

export interface Modell {
  /** Index → Kategorie-Id. Die Reihenfolge ist Teil des Modells (Gewichts-Layout). */
  readonly kategorien: readonly string[];
  /** Index → Merkmal. Ein Merkmal, das hier fehlt, ist für das Modell nicht vorhanden. */
  readonly vokabular: readonly string[];
  /** Gewichte, zeilenweise je Kategorie: `gewichte[k * vokabular.length + j]`. */
  readonly gewichte: Float32Array;
  /** Grundneigung je Kategorie — fängt ab, dass manche Kategorien viel häufiger sind. */
  readonly bias: Float32Array;
  /** Wie viele Beispiele in dieses Modell geflossen sind. */
  readonly beispiele: number;
}

export interface TrainingsOptionen {
  /** Durchläufe über die Trainingsmenge. */
  readonly epochen?: number;
  /** Schrittweite des Gradientenabstiegs. */
  readonly lernrate?: number;
  /**
   * L2-Regularisierung. Hält einzelne Gewichte klein und verhindert, dass ein Token, das
   * genau einmal vorkommt, seine Kategorie im Alleingang entscheidet — bei ~2000
   * Merkmalen auf ~3700 Beispielen ist das der wahrscheinlichste Fehlermodus.
   */
  readonly l2?: number;
  /** Startwert des Mischens. Gleicher Wert ⇒ gleiches Modell. */
  readonly seed?: number;
}

/**
 * Am echten Bestand kalibriert (2026-08-16, 3689 Beispiele über 47 Kategorien): Gitter
 * über Epochen × Lernrate × L2, gemessen über FÜNF verschiedene Trainings-/Prüf-Splits.
 *
 * Über mehrere Splits und nicht über einen: der beste Einzelsplit lieferte 90,5 %, das
 * Mittel derselben Einstellung 89,1 %. Wer den Höchstwert eines Splits festschreibt,
 * kalibriert auf dessen Zufall und trägt die Differenz später als Enttäuschung nach.
 *
 * Gewählt: 89,1 % im Mittel (schlechtester Split 87,1 %), 137 ms über den ganzen Bestand.
 * 60 Epochen brachten nichts mehr, 20 lagen 0,3 Punkte darunter. L2 wirkt kaum — es
 * bleibt drin, weil es beim Wachsen des Vokabulars greift, nicht wegen der heutigen Zahl.
 */
export const STANDARD_TRAINING: Required<TrainingsOptionen> = {
  epochen: 40,
  lernrate: 0.05,
  l2: 1e-4,
  seed: 20260816,
};

/**
 * xorshift32 — winziger, deterministischer Zufallsgenerator für das Mischen.
 * `Math.random` wäre hier ein stiller Reproduzierbarkeits-Killer.
 */
function zufall(seed: number): () => number {
  let z = seed | 0 || 1;
  return () => {
    z ^= z << 13;
    z ^= z >>> 17;
    z ^= z << 5;
    return ((z >>> 0) % 0xffffffff) / 0xffffffff;
  };
}

/** Fisher-Yates, an Ort und Stelle, mit gesetztem Generator. */
function mischen(indizes: Int32Array, rnd: () => number): void {
  for (let i = indizes.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = indizes[i];
    indizes[i] = indizes[j];
    indizes[j] = t;
  }
}

/**
 * Trainiert ein Modell. Vokabular und Kategorienliste entstehen aus den Beispielen —
 * beides sortiert, damit dasselbe Material dasselbe Layout ergibt.
 *
 * Leere Eingabe liefert ein leeres Modell statt zu werfen: „noch nichts gelernt" ist ein
 * gültiger Zustand der App, kein Fehler.
 */
export function trainieren(
  beispiele: readonly Beispiel[],
  optionen: TrainingsOptionen = {},
): Modell {
  const opt = { ...STANDARD_TRAINING, ...optionen };

  const kategorien = [...new Set(beispiele.map((b) => b.kategorieId))].sort();
  const vokabular = [...new Set(beispiele.flatMap((b) => [...b.merkmale]))].sort();
  const K = kategorien.length;
  const V = vokabular.length;
  if (K === 0 || V === 0) {
    return { kategorien, vokabular, gewichte: new Float32Array(0), bias: new Float32Array(0), beispiele: 0 };
  }

  const merkmalIndex = new Map(vokabular.map((m, i) => [m, i]));
  const kategorieIndex = new Map(kategorien.map((k, i) => [k, i]));

  // Beispiele einmalig in Index-Form bringen — im inneren Schleifenkern darf keine
  // Zeichenkette mehr angefasst werden, sonst dominiert das Nachschlagen die Laufzeit.
  const x: Int32Array[] = beispiele.map(
    (b) => new Int32Array([...b.merkmale].map((m) => merkmalIndex.get(m)!).filter((i) => i !== undefined)),
  );
  const y = new Int32Array(beispiele.map((b) => kategorieIndex.get(b.kategorieId)!));

  const gewichte = new Float32Array(K * V);
  const bias = new Float32Array(K);
  const score = new Float64Array(K);

  const reihenfolge = new Int32Array(beispiele.length);
  for (let i = 0; i < beispiele.length; i++) reihenfolge[i] = i;
  const rnd = zufall(opt.seed);

  for (let epoche = 0; epoche < opt.epochen; epoche++) {
    mischen(reihenfolge, rnd);

    for (const i of reihenfolge) {
      const merkmale = x[i];
      const ziel = y[i];

      // Scores: Grundneigung plus die Gewichte der vorhandenen Merkmale.
      let max = -Infinity;
      for (let k = 0; k < K; k++) {
        let s = bias[k];
        const zeile = k * V;
        for (let n = 0; n < merkmale.length; n++) s += gewichte[zeile + merkmale[n]];
        score[k] = s;
        if (s > max) max = s;
      }

      // Softmax, gegen den Maximalwert verschoben — sonst läuft exp() bei größeren
      // Scores über und die Wahrscheinlichkeiten werden NaN.
      let summe = 0;
      for (let k = 0; k < K; k++) {
        score[k] = Math.exp(score[k] - max);
        summe += score[k];
      }

      for (let k = 0; k < K; k++) {
        const p = score[k] / summe;
        const fehler = p - (k === ziel ? 1 : 0);
        if (fehler === 0) continue;
        const schritt = opt.lernrate * fehler;
        const zeile = k * V;
        for (let n = 0; n < merkmale.length; n++) {
          const j = zeile + merkmale[n];
          gewichte[j] -= schritt + opt.l2 * gewichte[j];
        }
        bias[k] -= schritt;
      }
    }
  }

  return { kategorien, vokabular, gewichte, bias, beispiele: beispiele.length };
}

/** Ein Merkmal und was es zur gewählten Kategorie beigetragen hat. */
export interface Beitrag {
  readonly merkmal: string;
  readonly gewicht: number;
}

export interface Klassifikation {
  readonly kategorieId: string;
  /**
   * Sicherheit der Entscheidung (0…1), die Softmax-Wahrscheinlichkeit der Gewinnerin.
   *
   * Sie ist ausdrücklich KEINE Schwelle: das Modell legt sich immer fest (so entschieden
   * im Spike). Der Wert ist zum Anschauen da — für die Frage „wie knapp war das?" —,
   * nicht zum Verwerfen eines Vorschlags.
   */
  readonly sicherheit: number;
  /** Die stärksten Belege für die gewählte Kategorie, absteigend. */
  readonly beitraege: readonly Beitrag[];
  /** Merkmale der Zahlung, die das Modell nicht kennt — es hat sie schlicht ignoriert. */
  readonly unbekannt: readonly string[];
}

/** Wie viele Belege eine Begründung nennt. */
const BEITRAEGE_MAX = 5;

/**
 * Ordnet eine Zahlung einer Kategorie zu — oder liefert null, wenn das Modell leer ist
 * (noch nie trainiert). Unbekannte Merkmale werden ignoriert und getrennt gemeldet.
 */
export function klassifizieren(
  modell: Modell,
  merkmale: readonly string[],
): Klassifikation | null {
  const K = modell.kategorien.length;
  const V = modell.vokabular.length;
  if (K === 0 || V === 0) return null;

  const index = new Map(modell.vokabular.map((m, i) => [m, i]));
  const bekannt: number[] = [];
  const unbekannt: string[] = [];
  for (const m of merkmale) {
    const i = index.get(m);
    if (i === undefined) unbekannt.push(m);
    else bekannt.push(i);
  }

  const score = new Float64Array(K);
  let max = -Infinity;
  let gewinner = 0;
  for (let k = 0; k < K; k++) {
    let s = modell.bias[k];
    const zeile = k * V;
    for (const j of bekannt) s += modell.gewichte[zeile + j];
    score[k] = s;
    if (s > max) {
      max = s;
      gewinner = k;
    }
  }

  let summe = 0;
  for (let k = 0; k < K; k++) summe += Math.exp(score[k] - max);

  const zeile = gewinner * V;
  const beitraege = bekannt
    .map((j) => ({ merkmal: modell.vokabular[j], gewicht: modell.gewichte[zeile + j] }))
    .sort((a, b) => Math.abs(b.gewicht) - Math.abs(a.gewicht) || a.merkmal.localeCompare(b.merkmal))
    .slice(0, BEITRAEGE_MAX);

  return {
    kategorieId: modell.kategorien[gewinner],
    sicherheit: 1 / summe,
    beitraege,
    unbekannt,
  };
}

export interface Kategoriewert {
  readonly kategorieId: string;
  readonly richtig: number;
  readonly gesamt: number;
}

export interface Bewertung {
  /** Anteil richtig zugeordneter Beispiele (0…1). */
  readonly genauigkeit: number;
  readonly richtig: number;
  readonly gesamt: number;
  /** Je Kategorie, schwächste zuerst — dort lohnt das Nachschauen. */
  readonly jeKategorie: readonly Kategoriewert[];
}

/** Misst das Modell an Beispielen, die es nicht gesehen hat. */
export function bewerten(modell: Modell, beispiele: readonly Beispiel[]): Bewertung {
  const je = new Map<string, { richtig: number; gesamt: number }>();
  let richtig = 0;

  for (const b of beispiele) {
    const k = klassifizieren(modell, b.merkmale);
    const treffer = k?.kategorieId === b.kategorieId;
    if (treffer) richtig++;
    const e = je.get(b.kategorieId) ?? { richtig: 0, gesamt: 0 };
    e.gesamt++;
    if (treffer) e.richtig++;
    je.set(b.kategorieId, e);
  }

  return {
    genauigkeit: beispiele.length ? richtig / beispiele.length : 0,
    richtig,
    gesamt: beispiele.length,
    jeKategorie: [...je]
      .map(([kategorieId, e]) => ({ kategorieId, ...e }))
      .sort((a, b) => a.richtig / a.gesamt - b.richtig / b.gesamt || b.gesamt - a.gesamt),
  };
}

/**
 * Teilt die Beispiele deterministisch in Trainings- und Prüfmenge.
 *
 * Warum das in den Kern gehört und nicht ins Messskript: die App soll nach dem Training
 * sagen können, wie gut sie ist. Eine Genauigkeit, die auf denselben Zeilen gemessen wird,
 * auf denen trainiert wurde, ist keine Zahl, sondern eine Selbstbestätigung.
 */
export function aufteilen(
  beispiele: readonly Beispiel[],
  pruefanteil = 0.2,
  seed = STANDARD_TRAINING.seed,
): { training: Beispiel[]; pruefung: Beispiel[] } {
  const reihenfolge = new Int32Array(beispiele.length);
  for (let i = 0; i < beispiele.length; i++) reihenfolge[i] = i;
  mischen(reihenfolge, zufall(seed));

  const grenze = Math.floor(beispiele.length * (1 - pruefanteil));
  const training: Beispiel[] = [];
  const pruefung: Beispiel[] = [];
  for (let i = 0; i < reihenfolge.length; i++) {
    (i < grenze ? training : pruefung).push(beispiele[reihenfolge[i]]);
  }
  return { training, pruefung };
}
