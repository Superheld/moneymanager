// Die Erklärung einer Entscheidung — nicht „was sprach für die Gewinnerin", sondern
// „warum sie und nicht jene".
//
// Bis 2026-11-09 nannte die Begründung die stärksten Gewichte der GEWÄHLTEN Kategorie
// (`Klassifikation.beitraege`). Das beantwortet die Frage nicht, mit der man vor einem
// Fehlgriff sitzt. Ein Wort kann für die Gewinnerin stark sprechen und für die richtige
// Kategorie noch stärker — dann hat es den Fehler nicht verursacht, sondern gebremst.
// Und ein Wort, das in jeder Kategorie ähnlich wiegt, steht oben in der Liste, obwohl es
// nichts entschieden hat. Ausschlaggebend ist der ABSTAND zweier Kategorien, und der ist
// bei einem linearen Modell exakt zerlegbar:
//
//     score(A) − score(B) = (bias_A − bias_B) + Σ_j (w_Aj − w_Bj)
//
// Jedes Merkmal trägt genau seinen Summanden bei, die Grundneigung ihren — die Posten
// addieren sich ohne Rest zum Abstand. Das ist keine Näherung wie SHAP oder LIME bei
// grösseren Modellen, sondern die Rechnung selbst; im Fachjargon eine kontrastive
// Erklärung („contrastive explanation").
//
// Die GRUNDNEIGUNG steht als eigener Posten da, und das ist der zweite Grund für diese
// Datei: sie entscheidet bei ungleich grossen Kategorien oft mit, und in der alten
// Begründung kam sie gar nicht vor. Eine Zahlung mit lauter schwachen Wörtern landet in
// der häufigsten Kategorie — nicht wegen eines Wortes, sondern weil nichts dagegen sprach.

import type { Modell } from "./modell";

/** Eine Kategorie, wie das Modell sie für diese Zahlung bewertet. */
export interface Kandidat {
  readonly kategorieId: string;
  /** Softmax-Wahrscheinlichkeit (0…1). */
  readonly wahrscheinlichkeit: number;
  /** Rang, 1 = Gewinnerin. */
  readonly rang: number;
}

/** Ein Merkmal und sein Anteil am Abstand zwischen zwei Kategorien. */
export interface Erklaerungsposten {
  readonly merkmal: string;
  /** Gewicht für die gewählte Kategorie. */
  readonly fuer: number;
  /** Gewicht für die Vergleichskategorie (0, wenn das Modell sie nicht kennt). */
  readonly gegen: number;
  /** `fuer − gegen`. Positiv: zog zur gewählten, negativ: zur Vergleichskategorie. */
  readonly differenz: number;
}

export interface Erklaerung {
  /** Die besten Kandidaten, absteigend. */
  readonly kandidaten: readonly Kandidat[];
  readonly gewaehlt: Kandidat;
  /**
   * Womit verglichen wird: die vorgegebene Kategorie (beim Fehlgriff die richtige),
   * sonst die zweitbeste. `null`, wenn es keine zweite gibt.
   */
  readonly vergleich: Kandidat | null;
  /**
   * Die vorgegebene Kategorie kam im Training nicht vor — das Modell KONNTE sie nicht
   * wählen. Das ist selbst die Erklärung, und eine wichtige: kein Wort hätte geholfen.
   */
  readonly vergleichUnbekannt: boolean;
  /** Alle bekannten Merkmale der Zahlung, nach Betrag der Differenz absteigend. */
  readonly posten: readonly Erklaerungsposten[];
  /** Der Posten der Grundneigung — gleich gebaut, nur ohne Merkmal. */
  readonly grundneigung: Omit<Erklaerungsposten, "merkmal">;
  /** `score(gewählt) − score(vergleich)` — die Summe aller Differenzen samt Grundneigung. */
  readonly abstand: number;
  /** Merkmale der Zahlung, die das Modell nicht kennt — sie haben nichts beigetragen. */
  readonly unbekannt: readonly string[];
}

/** Wie viele Kandidaten eine Erklärung nennt. */
const KANDIDATEN = 3;

/**
 * Erklärt, warum das Modell für diese Merkmale seine Kategorie wählt — gegen
 * `vergleichMit`, oder ohne Vorgabe gegen die Zweitbeste.
 *
 * `null` bei einem leeren Modell, wie `klassifizieren`.
 */
export function erklaeren(
  modell: Modell,
  merkmale: readonly string[],
  vergleichMit?: string,
): Erklaerung | null {
  const K = modell.kategorien.length;
  const V = modell.vokabular.length;
  if (K === 0 || V === 0) return null;

  const index = new Map(modell.vokabular.map((m, i) => [m, i]));
  const bekannt: { merkmal: string; j: number }[] = [];
  const unbekannt: string[] = [];
  const gesehen = new Set<string>();
  for (const m of merkmale) {
    // Doppelte Merkmale zählen im Modell nicht doppelt (die Extraktion dedupliziert);
    // hier dasselbe, sonst ginge die Summe der Posten nicht mehr im Abstand auf.
    if (gesehen.has(m)) continue;
    gesehen.add(m);
    const j = index.get(m);
    if (j === undefined) unbekannt.push(m);
    else bekannt.push({ merkmal: m, j });
  }

  const score = new Float64Array(K);
  let max = -Infinity;
  for (let k = 0; k < K; k++) {
    let s = modell.bias[k];
    for (const { j } of bekannt) s += modell.gewichte[k * V + j];
    score[k] = s;
    if (s > max) max = s;
  }
  let summe = 0;
  for (let k = 0; k < K; k++) summe += Math.exp(score[k] - max);

  // Rangfolge: Score absteigend, bei Gleichstand nach Index — dieselbe Wahl wie in
  // `klassifizieren`, das bei Gleichstand die erste nimmt.
  const reihe = Array.from({ length: K }, (_, k) => k).sort((a, b) => score[b] - score[a] || a - b);
  const kandidat = (k: number): Kandidat => ({
    kategorieId: modell.kategorien[k],
    wahrscheinlichkeit: Math.exp(score[k] - max) / summe,
    rang: reihe.indexOf(k) + 1,
  });

  const g = reihe[0];
  const vorgegeben = vergleichMit !== undefined ? modell.kategorien.indexOf(vergleichMit) : -1;
  const vergleichUnbekannt = vergleichMit !== undefined && vorgegeben < 0;
  // Ohne Vorgabe die Zweitbeste. Mit einer Vorgabe, die die Gewinnerin selbst ist, gibt
  // es keinen Fehlgriff zu erklären — dann ebenfalls die Zweitbeste.
  const v =
    vorgegeben >= 0 && vorgegeben !== g ? vorgegeben : K > 1 && !vergleichUnbekannt ? reihe[1] : -1;

  const gewicht = (k: number, j: number) => (k < 0 ? 0 : modell.gewichte[k * V + j]);
  const posten: Erklaerungsposten[] = bekannt
    .map(({ merkmal, j }) => {
      const fuer = gewicht(g, j);
      const gegen = gewicht(v, j);
      return { merkmal, fuer, gegen, differenz: fuer - gegen };
    })
    .sort((a, b) => Math.abs(b.differenz) - Math.abs(a.differenz) || a.merkmal.localeCompare(b.merkmal));

  const biasFuer = modell.bias[g];
  const biasGegen = v < 0 ? 0 : modell.bias[v];

  return {
    kandidaten: reihe.slice(0, KANDIDATEN).map(kandidat),
    gewaehlt: kandidat(g),
    vergleich: v < 0 ? null : kandidat(v),
    vergleichUnbekannt,
    posten,
    grundneigung: { fuer: biasFuer, gegen: biasGegen, differenz: biasFuer - biasGegen },
    abstand: v < 0 ? 0 : score[g] - score[v],
    unbekannt,
  };
}
