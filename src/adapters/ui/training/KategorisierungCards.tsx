// Die automatische Kategorisierung — vier Karten entlang des Ablaufs, den ein Training
// tatsächlich hat: Daten sichten, Wörter beurteilen, trainieren und prüfen, Bestand
// abgleichen.
//
// Vier statt einer, weil das die Reihenfolge ist, in der man die Fragen stellt. Eine
// einzige Karte mit allem drin zeigte das Ergebnis oben und seine Grundlage unten — also
// rückwärts — und war so lang, dass man den Anfang nicht mehr sah.
//
// **Es waren einmal fünf.** „Merkmale" und „Ausschlüsse" lagen getrennt, und das war der
// Schnitt an der falschen Stelle: dieselben Wörter, zweimal gezeigt, mit verschiedenen
// Spalten — wer eines abwählte, sah es hier verschwinden und musste es dort
// wiederfinden. Sie sind zu „Wörter" verschmolzen, und ein Ausschluss wechselt jetzt den
// Zustand einer Zeile, statt sie an einen anderen Ort zu verschieben.
//
// Geladen wird gemeinsam und erst beim Betreten des Bereichs: die Auswertung zieht den
// gesamten Ledger und rechnet die Merkmale darüber. Je Karte getrennt zu laden wäre
// dieselbe Arbeit mehrfach.

import { useProzent } from "../bausteine/einstellungenKontext";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Bewertung, type Kategorie } from "../../../application";
import { type Abgleichsplan } from "../../../application/kategorien/kategorieAbgleich";
import type { Wirkung } from "../../../application/kategorien/merkmalskonfiguration";
import type { Laufvergleichsicht, Messprotokoll } from "../../../application/kategorien/klassifikatorTraining";
import {
  herkunftUmschalten,
  kategorieAbgleichAnwenden,
  kategorieAbgleichVorschau,
  merkmalskonfiguration,
  merkmalswirkung,
  laufhistorie,
  modellStand,
  modellTrainieren,
  trainingsdaten,
  grundausstattungZurueck,
  wortFreigeben,
  wortSperren,
} from "../../dienste";
import { Card } from "../bausteine";
import { Bereich } from "../bausteine/Bereich";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";
import { type Daten, type Grundlinie } from "./kartenteile";
import { AbgleichInhalt } from "./AbgleichInhalt";
import { DatenInhalt } from "./DatenInhalt";
import { ModellInhalt } from "./ModellInhalt";
import { WoerterInhalt } from "./WoerterInhalt";

export function KategorisierungCards({ kategorien }: { kategorien: Kategorie[] }) {
  const { t } = useTranslation();
  const prozent = useProzent();
  const { locale } = useGeld();
  const [daten, setDaten] = useState<Daten | null>(null);
  const [angefordert, setAngefordert] = useState(false);
  const [laeuft, setLaeuft] = useState<"training" | "wirkung" | "abgleich" | "anwenden" | null>(null);
  // Der gerechnete, noch NICHT geschriebene Abgleich. Rechnen und Schreiben sind hier
  // getrennt: der Lauf ändert die Zahl, die in jedem Budget steht.
  const [plan, setPlan] = useState<Abgleichsplan | null>(null);
  const [angewendet, setAngewendet] = useState<number | null>(null);
  const [bewertung, setBewertung] = useState<Bewertung | null>(null);
  /** Was blindes Raten träfe — ohne sie sagt die Genauigkeit daneben nichts. */
  const [grundlinie, setGrundlinie] = useState<Grundlinie | null>(null);
  /** Wie gemessen wurde und was neben der Trefferquote steht. */
  const [protokoll, setProtokoll] = useState<Messprotokoll | null>(null);
  /** Gegenüber dem vorigen Lauf — nur direkt nach einem Training. */
  const [vergleich, setVergleich] = useState<Laufvergleichsicht | null>(null);
  const [wirkung, setWirkung] = useState<{ basis: number; wirkungen: Wirkung[] } | null>(null);
  const [listenGeaendert, setListenGeaendert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  /**
   * Lädt Konfiguration, Material und Modellzustand — in dieser Reihenfolge, weil das
   * Material von der Konfiguration abhängt: welche Merkmale entstehen, entscheidet sie.
   * Material und Zustand danach zusammen, damit die Karten nicht kurz gegen einen halb
   * gefüllten Stand rechnen.
   */
  async function laden() {
    const stand = await merkmalskonfiguration();
    const [material, zustand, laeufe] = await Promise.all([
      trainingsdaten(stand.konfiguration),
      modellStand(stand.konfiguration),
      laufhistorie(),
    ]);
    setDaten({
      material,
      zustand,
      laeufe,
      herkuenfte: stand.konfiguration.herkuenfte,
      ausschluesse: stand.ausschluesse,
    });
  }

  // Geladen wird beim Betreten des Bereichs, nicht beim Aufklappen einer Karte: die
  // Komponente entsteht erst, wenn jemand „Training" wählt. Die Trainingsdaten ziehen den
  // gesamten Ledger und rechnen die Merkmale darüber — dass das nicht nebenbei beim
  // Öffnen der Einstellungen passiert, war schon der Grund für das verzögerte Aufklappen.
  useEffect(() => {
    if (angefordert) return;
    setAngefordert(true);
    laden().catch((e) => setFehler(fehlerNachricht(t, e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Nach jeder Listenänderung: neu rechnen und merken, dass das Modell hinterherhinkt. */
  async function nachAenderung(aktion: Promise<unknown>) {
    setFehler(null);
    try {
      await aktion;
      // Die gemessene Wirkung galt für die alten Listen — sie stehen zu lassen hieße,
      // eine Zahl zu zeigen, die zu den Daten daneben nicht mehr passt.
      setWirkung(null);
      setListenGeaendert(true);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function trainingStarten() {
    if (laeuft || !daten) return;
    setLaeuft("training");
    setFehler(null);
    try {
      const r = await modellTrainieren({ herkuenfte: daten.herkuenfte, ausschluesse: daten.ausschluesse });
      setBewertung(r.bewertung ?? null);
      setGrundlinie(r.grundlinie ?? null);
      setProtokoll(r.protokoll ?? null);
      setVergleich(r.vergleich ?? null);
      setListenGeaendert(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(null);
    }
  }

  async function wirkungStarten() {
    if (laeuft || !daten) return;
    setLaeuft("wirkung");
    setFehler(null);
    try {
      setWirkung(await merkmalswirkung({ herkuenfte: daten.herkuenfte, ausschluesse: daten.ausschluesse }));
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(null);
    }
  }

  async function vorschauRechnen() {
    if (laeuft) return;
    setLaeuft("abgleich");
    setFehler(null);
    setAngewendet(null);
    try {
      setPlan(await kategorieAbgleichVorschau());
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(null);
    }
  }

  async function planUebernehmen() {
    if (laeuft || !plan) return;
    setLaeuft("anwenden");
    setFehler(null);
    try {
      setAngewendet(await kategorieAbgleichAnwenden(plan));
      // Der Plan ist verbraucht: stehen zu lassen hieße, einen Knopf anzubieten, der
      // dieselbe Arbeit ein zweites Mal verspricht.
      setPlan(null);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(null);
    }
  }

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const hilfe = {
    t,
    daten,
    kategorieName,
    zahl: (n: number) => n.toLocaleString(locale),
    prozent: (x: number) => prozent(x, 1),
  };

  return (
    <Bereich
      titel={t("shell.navTraining")}
      register={[
        {
          id: "daten",
          label: t("einstellungen.lernmaterial.datenTitel"),
          untertitel: t("einstellungen.lernmaterial.datenUntertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <DatenInhalt {...hilfe} />
            </Card>
          ),
        },
        {
          id: "woerter",
          label: t("einstellungen.lernmaterial.woerterTitel"),
          untertitel: t("einstellungen.lernmaterial.woerterUntertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <WoerterInhalt
                {...hilfe}
                wirkung={wirkung}
                misst={laeuft === "wirkung"}
                aufWirkung={wirkungStarten}
                aufSchalten={(h, aktiv) => nachAenderung(herkunftUmschalten(h, aktiv))}
                aufAusschliessen={(wort, herkuenfte) =>
                  nachAenderung(wortSperren(wort, herkuenfte))
                }
                aufZulassen={(wort) => nachAenderung(wortFreigeben(wort))}
                aufGrundausstattung={() => nachAenderung(grundausstattungZurueck())}
              />
            </Card>
          ),
        },
        {
          id: "modell",
          label: t("einstellungen.lernmaterial.modellKarteTitel"),
          untertitel: t("einstellungen.lernmaterial.modellKarteUntertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <ModellInhalt
                {...hilfe}
                bewertung={bewertung}
                grundlinie={grundlinie}
                protokoll={protokoll}
                vergleich={vergleich}
                trainiert={laeuft === "training"}
                listenGeaendert={listenGeaendert}
                aufTraining={trainingStarten}
              />
            </Card>
          ),
        },
        {
          id: "abgleich",
          label: t("einstellungen.abgleich.titel"),
          untertitel: t("einstellungen.abgleich.untertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <AbgleichInhalt
                {...hilfe}
                plan={plan}
                angewendet={angewendet}
                rechnet={laeuft === "abgleich"}
                schreibt={laeuft === "anwenden"}
                aufVorschau={vorschauRechnen}
                aufUebernehmen={planUebernehmen}
              />
            </Card>
          ),
        },
      ]}
    />
  );
}

// ------------------------------------------------------------ 5 · Bestand abgleichen
