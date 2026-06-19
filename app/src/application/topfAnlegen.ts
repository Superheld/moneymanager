// Use-Case „Topf anlegen" — eine Eingabe, drei Spielarten. Übersetzt Euro/Monate in
// das passende Topf-Aggregat und validiert je Typ.

import { FachlicherFehler, type Cent, type Topf, type TopfTyp } from "../core";
import type { TopfRepository } from "./ports";

export interface TopfEingabe {
  typ: TopfTyp;
  bezeichnung: string;
  start: string; // ISO
  kategorieId?: string;
  // Geldfelder in Minor Units (die UI parst währungsgerecht)
  // ersatz
  wiederbeschaffung?: Cent;
  nutzungsdauerMonate?: number;
  // puffer
  schaetzbetrag?: Cent;
  fristMonate?: number;
  // spartopf
  zufuehrungProMonat?: Cent;
  sparziel?: Cent;
}

export async function topfAnlegen(repo: TopfRepository, e: TopfEingabe, id?: string): Promise<Topf> {
  const bezeichnung = e.bezeichnung.trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start)) throw new FachlicherFehler("startdatum.ungueltig");

  const basis = { id: id ?? crypto.randomUUID(), bezeichnung, start: e.start, kategorieId: e.kategorieId || undefined };

  let topf: Topf;
  switch (e.typ) {
    case "ersatz":
      if (!(Number(e.wiederbeschaffung) > 0)) throw new FachlicherFehler("wiederbeschaffung.groesserNull");
      if (!(Number(e.nutzungsdauerMonate) > 0)) throw new FachlicherFehler("nutzungsdauer.groesserNull");
      topf = {
        ...basis,
        typ: "ersatz",
        wiederbeschaffung: e.wiederbeschaffung!,
        nutzungsdauerMonate: Math.round(e.nutzungsdauerMonate!),
      };
      break;
    case "puffer":
      if (!(Number(e.schaetzbetrag) > 0)) throw new FachlicherFehler("schaetzbetrag.groesserNull");
      if (!(Number(e.fristMonate) > 0)) throw new FachlicherFehler("zeitfenster.groesserNull");
      topf = {
        ...basis,
        typ: "puffer",
        schaetzbetrag: e.schaetzbetrag!,
        fristMonate: Math.round(e.fristMonate!),
      };
      break;
    case "spartopf":
      if (!(Number(e.zufuehrungProMonat) > 0)) throw new FachlicherFehler("zufuehrung.groesserNull");
      topf = {
        ...basis,
        typ: "spartopf",
        zufuehrungProMonat: e.zufuehrungProMonat!,
        sparziel: e.sparziel && e.sparziel > 0 ? e.sparziel : undefined,
      };
      break;
  }

  await repo.speichern(topf);
  return topf;
}
