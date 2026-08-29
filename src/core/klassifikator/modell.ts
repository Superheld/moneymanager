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

/** Ein Merkmal und wie stark es für seine Kategorie spricht. */
export interface Kennzeichen {
  readonly merkmal: string;
  /** Zentriertes Gewicht: um wie viel stärker als im Durchschnitt aller Kategorien. */
  readonly staerke: number;
}

/** Was eine Kategorie im Modell auszeichnet. */
export interface Kategorieprofil {
  readonly kategorieId: string;
  /** Die stärksten Kennzeichen, absteigend. */
  readonly kennzeichen: readonly Kennzeichen[];
}

/**
 * Liest das Modell zeilenweise: welche Merkmale sprechen für welche Kategorie.
 *
 * Bei einem linearen Modell ist das keine nachgebaute Erklärung, sondern die Rechnung
 * selbst — `gewichte[k * V + j]` IST, wie stark Merkmal j für Kategorie k spricht. Genau
 * deshalb steht hier das Modell und nicht die Häufigkeitsverteilung aus dem
 * Trainingsmaterial: die sagt, wo ein Wort VORKAM, das Gewicht sagt, was die Erkennung
 * daraus gemacht hat. Wo beides auseinanderfällt, ist das Gewicht die ehrlichere Auskunft.
 *
 * **Zentriert über die Kategorien**, und daran hängt die Brauchbarkeit: ein Merkmal, das
 * in jeder Zeile steht, bekommt überall ein ähnliches Gewicht und stünde sonst in JEDER
 * Wolke groß da — als Kennzeichen von allem, also von nichts. Der Abstand zum Mittel über
 * alle Kategorien nimmt genau diesen Sockel weg.
 *
 * Nur positive Stärken: ein negatives Gewicht heißt „spricht gegen diese Kategorie", und
 * das ist eine andere Frage als „was zeichnet sie aus".
 */
export function kategorieprofile(modell: Modell, proKategorie = 25): Kategorieprofil[] {
  const K = modell.kategorien.length;
  const V = modell.vokabular.length;
  if (K === 0 || V === 0) return [];

  // Der Sockel je Merkmal — einmal für alle Kategorien gerechnet.
  const mittel = new Float64Array(V);
  for (let k = 0; k < K; k++) {
    const zeile = k * V;
    for (let j = 0; j < V; j++) mittel[j] += modell.gewichte[zeile + j];
  }
  for (let j = 0; j < V; j++) mittel[j] /= K;

  return modell.kategorien.map((kategorieId, k) => {
    const zeile = k * V;
    const kennzeichen: Kennzeichen[] = [];
    for (let j = 0; j < V; j++) {
      const staerke = modell.gewichte[zeile + j] - mittel[j];
      if (staerke > 0) kennzeichen.push({ merkmal: modell.vokabular[j], staerke });
    }
    kennzeichen.sort((a, b) => b.staerke - a.staerke || a.merkmal.localeCompare(b.merkmal));
    return { kategorieId, kennzeichen: kennzeichen.slice(0, proKategorie) };
  });
}

export interface Kategoriewert {
  readonly kategorieId: string;
  readonly richtig: number;
  readonly gesamt: number;
}

/** Eine Zelle der Verwechslungsmatrix abseits der Diagonale: was wurde wofür gehalten. */
export interface Verwechslung {
  readonly tatsaechlich: string;
  readonly vorhergesagt: string;
  readonly anzahl: number;
}

export interface Bewertung {
  /** Anteil richtig zugeordneter Beispiele (0…1). */
  readonly genauigkeit: number;
  readonly richtig: number;
  readonly gesamt: number;
  /** Je Kategorie, schwächste zuerst — dort lohnt das Nachschauen. */
  readonly jeKategorie: readonly Kategoriewert[];
  /**
   * Die Verwechslungsmatrix, ohne ihre Nullen.
   *
   * `jeKategorie` trägt Diagonale und Zeilensumme (richtig von gesamt), `verwechslungen`
   * alle übrigen belegten Zellen — zusammen ist das die vollständige Matrix. Sie als
   * dichtes Feld zu führen hieße bei 49 Kategorien 2401 Zellen, von denen rund 98 %
   * null sind; und die Frage, die man an so eine Matrix stellt, ist ohnehin „was wird
   * womit verwechselt", nicht „wie viele Nullen gibt es".
   *
   * Absteigend nach Häufigkeit, bei Gleichstand alphabetisch — stabil zwischen Läufen.
   */
  readonly verwechslungen: readonly Verwechslung[];
}

/** Misst das Modell an Beispielen, die es nicht gesehen hat. */
export function bewerten(modell: Modell, beispiele: readonly Beispiel[]): Bewertung {
  const je = new Map<string, { richtig: number; gesamt: number }>();
  const paare = new Map<string, Verwechslung>();
  let richtig = 0;

  for (const b of beispiele) {
    const k = klassifizieren(modell, b.merkmale);
    const treffer = k?.kategorieId === b.kategorieId;
    if (treffer) richtig++;
    const e = je.get(b.kategorieId) ?? { richtig: 0, gesamt: 0 };
    e.gesamt++;
    if (treffer) e.richtig++;
    je.set(b.kategorieId, e);

    // Ein leeres Modell liefert null — dann gibt es keine Vorhersage, die man als
    // Verwechslung führen könnte; die Zeile zählt trotzdem als Fehlschlag.
    if (!treffer && k) {
      const schluessel = `${b.kategorieId} ${k.kategorieId}`;
      const vorhanden = paare.get(schluessel);
      paare.set(schluessel, {
        tatsaechlich: b.kategorieId,
        vorhergesagt: k.kategorieId,
        anzahl: (vorhanden?.anzahl ?? 0) + 1,
      });
    }
  }

  return {
    genauigkeit: beispiele.length ? richtig / beispiele.length : 0,
    richtig,
    gesamt: beispiele.length,
    jeKategorie: [...je]
      .map(([kategorieId, e]) => ({ kategorieId, ...e }))
      .sort((a, b) => a.richtig / a.gesamt - b.richtig / b.gesamt || b.gesamt - a.gesamt),
    verwechslungen: [...paare.values()].sort(
      (a, b) =>
        b.anzahl - a.anzahl ||
        a.tatsaechlich.localeCompare(b.tatsaechlich) ||
        a.vorhergesagt.localeCompare(b.vorhergesagt),
    ),
  };
}

/** Eine Zeile der Verwechslungsmatrix: eine tatsächliche Kategorie und wohin sie ging. */
export interface Matrixzeile {
  readonly kategorieId: string;
  /** Beispiele dieser Kategorie in der Prüfmenge. */
  readonly gesamt: number;
  /** Davon richtig erkannt (die Diagonale). */
  readonly richtig: number;
  /** Vorhergesagte Kategorie → Anzahl. Nur belegte Zellen, Diagonale eingeschlossen. */
  readonly zellen: ReadonlyMap<string, number>;
}

/**
 * Baut aus einer Bewertung die Verwechslungsmatrix — beschränkt auf die Kategorien, die
 * an mindestens einem Fehler beteiligt sind (als tatsächliche oder als vorhergesagte).
 *
 * Warum beschränkt: Auf echten Daten standen 43 Kategorien in der Prüfmenge, aber nur 25
 * kamen in einem Fehler vor. Die vollen 43×43 wären 1849 Zellen, von denen 50 belegt
 * sind — die restlichen Zeilen bestünden aus ihrer Diagonale und sonst nichts. Sie
 * fügen der Frage „was wird womit verwechselt" nichts hinzu und machen die Matrix so
 * breit, dass man sie nicht mehr überblickt.
 *
 * Die weggelassenen Kategorien sind nicht verschwiegen: sie stehen in `jeKategorie` mit
 * ihrer Trefferquote von 100 %.
 */
export function verwechslungsmatrix(b: Bewertung): {
  kategorien: string[];
  zeilen: Matrixzeile[];
} {
  const beteiligt = new Set<string>();
  for (const v of b.verwechslungen) {
    beteiligt.add(v.tatsaechlich);
    beteiligt.add(v.vorhergesagt);
  }

  const wert = new Map(b.jeKategorie.map((k) => [k.kategorieId, k]));
  const kategorien = [...beteiligt].sort();

  const zeilen = kategorien.map((kategorieId): Matrixzeile => {
    const k = wert.get(kategorieId);
    const zellen = new Map<string, number>();
    // Die Diagonale kommt aus `jeKategorie`; eine Kategorie, die nur als FALSCHE
    // Vorhersage auftaucht, hat dort keinen Eintrag und damit auch keine Zeilensumme.
    if (k?.richtig) zellen.set(kategorieId, k.richtig);
    for (const v of b.verwechslungen) {
      if (v.tatsaechlich === kategorieId) zellen.set(v.vorhergesagt, v.anzahl);
    }
    return { kategorieId, gesamt: k?.gesamt ?? 0, richtig: k?.richtig ?? 0, zellen };
  });

  return { kategorien, zeilen };
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
