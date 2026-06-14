// Use-Case „Topf anlegen" — eine Eingabe, drei Spielarten. Übersetzt Euro/Monate in
// das passende Topf-Aggregat und validiert je Typ.

import { euroZuCent, type Topf, type TopfTyp } from "../core";
import type { TopfRepository } from "./ports";

export interface TopfEingabe {
  typ: TopfTyp;
  bezeichnung: string;
  start: string; // ISO
  kategorieId?: string;
  // ersatz
  wiederbeschaffungEuro?: number;
  nutzungsdauerMonate?: number;
  // puffer
  schaetzbetragEuro?: number;
  fristMonate?: number;
  // spartopf
  zufuehrungProMonatEuro?: number;
  sparzielEuro?: number;
}

export async function topfAnlegen(repo: TopfRepository, e: TopfEingabe): Promise<Topf> {
  const bezeichnung = e.bezeichnung.trim();
  if (!bezeichnung) throw new Error("Bitte eine Bezeichnung angeben.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start)) throw new Error("Bitte ein gültiges Startdatum angeben.");

  const basis = { id: crypto.randomUUID(), bezeichnung, start: e.start, kategorieId: e.kategorieId || undefined };

  let topf: Topf;
  switch (e.typ) {
    case "ersatz":
      if (!(Number(e.wiederbeschaffungEuro) > 0)) throw new Error("Wiederbeschaffungswert muss größer als 0 sein.");
      if (!(Number(e.nutzungsdauerMonate) > 0)) throw new Error("Nutzungsdauer (Monate) muss größer als 0 sein.");
      topf = {
        ...basis,
        typ: "ersatz",
        wiederbeschaffung: euroZuCent(e.wiederbeschaffungEuro!),
        nutzungsdauerMonate: Math.round(e.nutzungsdauerMonate!),
      };
      break;
    case "puffer":
      if (!(Number(e.schaetzbetragEuro) > 0)) throw new Error("Schätzbetrag muss größer als 0 sein.");
      if (!(Number(e.fristMonate) > 0)) throw new Error("Zeitfenster (Monate) muss größer als 0 sein.");
      topf = {
        ...basis,
        typ: "puffer",
        schaetzbetrag: euroZuCent(e.schaetzbetragEuro!),
        fristMonate: Math.round(e.fristMonate!),
      };
      break;
    case "spartopf":
      if (!(Number(e.zufuehrungProMonatEuro) > 0)) throw new Error("Zuführung pro Monat muss größer als 0 sein.");
      topf = {
        ...basis,
        typ: "spartopf",
        zufuehrungProMonat: euroZuCent(e.zufuehrungProMonatEuro!),
        sparziel: e.sparzielEuro && e.sparzielEuro > 0 ? euroZuCent(e.sparzielEuro) : undefined,
      };
      break;
  }

  await repo.speichern(topf);
  return topf;
}
