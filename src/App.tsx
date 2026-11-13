import { useCallback, useEffect, useState } from "react";
import { AppShell, type ScreenId } from "./adapters/ui/bausteine/AppShell";
import { UebersichtScreen } from "./adapters/ui/uebersicht/UebersichtScreen";
import { AnalyseScreen } from "./adapters/ui/analyse/AnalyseScreen";
import { KontenScreen } from "./adapters/ui/konten/KontenScreen";
import { KontenVerwaltungScreen } from "./adapters/ui/konten/KontenVerwaltungScreen";
import { EinstellungenScreen } from "./adapters/ui/einstellungen/EinstellungenScreen";
import { VertraegeScreen } from "./adapters/ui/vertraege/VertraegeScreen";
import { BudgetsScreen } from "./adapters/ui/budgets/BudgetsScreen";
import { RuecklagenScreen } from "./adapters/ui/ruecklagen/RuecklagenScreen";
import { ImportBereich } from "./adapters/ui/import/ImportBereich";
import { TrainingBereich } from "./adapters/ui/training/TrainingBereich";
import { EinstellungenProvider } from "./adapters/ui/bausteine/EinstellungenProvider";
import { useExperimente } from "./adapters/ui/bausteine/einstellungenKontext";
import { Fehlergrenze } from "./adapters/ui/bausteine/Fehlergrenze";
import { Sperrbildschirm } from "./adapters/ui/zugang/Sperrbildschirm";
import { useZeitsperre } from "./adapters/ui/zugang/useZeitsperre";
import {
  appStarten,
  zeitsperre,
  zugangEinrichten,
  zugangEntsperren,
  zugangMitCode,
  zugangsstand,
  zugangSperren,
} from "./adapters/dienste";
import "./adapters/ui/zugang/zugang.css";

/**
 * **Das Tor steht vor allem anderen.**
 *
 * Solange die Datenbank zu ist, wird kein Screen gerendert und kein Bootstrap gefahren —
 * nicht, weil es hübscher wäre, sondern weil jeder Screen sofort Daten lädt und damit
 * gegen eine geschlossene Datenbank liefe.
 *
 * Der Zustand kommt aus RUST, nicht aus dem Browser-Speicher: nach einem Neuladen des
 * Webviews weiss die Oberfläche nicht mehr, ob entsperrt wurde, der Rust-Teil aber schon.
 * Ein Zustand im Frontend wäre zudem eine Sperre, die sich mit F5 aufheben liesse.
 */
export default function App() {
  const [screen, setScreen] = useState<ScreenId>("uebersicht");
  const [stand, setStand] = useState<
    { art: "laedt" } | { art: "einrichten"; altbestand: boolean } | { art: "entsperren" } | { art: "offen" }
  >({ art: "laedt" });
  const [bereit, setBereit] = useState(false);
  const [minuten, setMinuten] = useState(0);

  const standHolen = useCallback(async () => {
    const s = await zugangsstand();
    if (!s.eingerichtet) return setStand({ art: "einrichten", altbestand: s.altbestand });
    if (!s.offen) return setStand({ art: "entsperren" });
    setStand({ art: "offen" });
  }, []);

  /**
   * Scheitert schon die erste Frage an Rust, gäbe es sonst gar nichts zu sehen: der
   * Zustand bliebe „lädt", und „lädt" zeichnet `null`. Der Fehler wird deshalb gemerkt
   * und beim Zeichnen geworfen — so landet er in der Fehlergrenze um die App und hat
   * dieselbe Anzeige wie jeder andere.
   */
  const [startfehler, setStartfehler] = useState<Error | null>(null);

  useEffect(() => {
    standHolen().catch((e: unknown) => setStartfehler(e instanceof Error ? e : new Error(String(e))));
  }, [standHolen]);

  // Bootstrap und Zeitsperre-Einstellung erst NACH dem Entsperren — beide reden mit der
  // Datenbank.
  useEffect(() => {
    if (stand.art !== "offen") return;
    let abgebrochen = false;
    void (async () => {
      await appStarten().catch(() => {});
      const m = await zeitsperre().catch(() => 0);
      if (!abgebrochen) {
        setMinuten(m);
        setBereit(true);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [stand.art]);

  const sperren = useCallback(() => {
    void (async () => {
      await zugangSperren();
      setBereit(false);
      setStand({ art: "entsperren" });
    })();
  }, []);

  useZeitsperre(stand.art === "offen" ? minuten : 0, sperren);

  if (startfehler) throw startfehler;
  if (stand.art === "laedt") return null;

  if (stand.art !== "offen") {
    return (
      <Sperrbildschirm
        grund={stand.art === "einrichten" ? "einrichten" : "entsperren"}
        altbestand={stand.art === "einrichten" && stand.altbestand}
        onEinrichten={async (p) => {
          const e = await zugangEinrichten(p);
          return e.art === "fertig"
            ? { ok: true, code: e.wiederherstellungscode }
            : { ok: false, befund: e.befund };
        }}
        onEntsperren={zugangEntsperren}
        onMitCode={async (code, neue) => {
          const r = await zugangMitCode(code, neue);
          return r.art === "fertig"
            ? { ok: true }
            : { ok: false, befund: r.art === "abgelehnt" ? r.befund : undefined };
        }}
        onFertig={() => void standHolen()}
      />
    );
  }

  if (!bereit) return null;

  return (
    <EinstellungenProvider>
      <Arbeitsflaeche screen={screen} setScreen={setScreen} sperren={sperren} />
    </EinstellungenProvider>
  );
}

/**
 * Navigation und Bereiche — INNERHALB des Einstellungs-Kontexts.
 *
 * Bis 2026-11-12 las `App` die Experimente einmal beim Start in einen eigenen Zustand,
 * neben dem Kontext, den der Schalter in den Einstellungen ändert. Zwei Kopien desselben
 * Stands: wer „Training" einschaltete, sah den Bereich erst nach einem Neustart. Jetzt
 * liest die Navigation dieselbe Quelle wie der Schalter. Aufblitzen kann dabei nichts —
 * der Provider zeichnet erst, wenn die Experimente geladen sind.
 */
function Arbeitsflaeche({
  screen,
  setScreen,
  sperren,
}: {
  screen: ScreenId;
  setScreen: (s: ScreenId) => void;
  sperren: () => void;
}) {
  const experimente = useExperimente();
  return (
    <>
      {/* Das Training ist ein EXPERIMENT (Wunsch 2026-08-31): es ist eine Werkbank,
          kein fertiger Bereich — man greift dort in die Merkmale ein, misst Varianten
          und trainiert neu. Ausgeliefert wird ein fertiges Modell; wer es selbst
          anfassen will, schaltet den Bereich in den Einstellungen zu. */}
      <AppShell
        current={screen}
        onNavigate={setScreen}
        versteckt={experimente.training ? [] : ["training"]}
      >
        {/* Um den INHALT, nicht um den Rahmen: zeichnet ein Screen nicht, bleibt die
            Navigation stehen, und ein Wechsel räumt die Meldung weg. */}
        <Fehlergrenze ruecksetzenBei={screen}>
        {screen === "uebersicht" && <UebersichtScreen />}
        {screen === "analyse" && <AnalyseScreen />}
        {screen === "konten" && <KontenScreen onNavigate={setScreen} />}
        {screen === "ruecklagen" && <RuecklagenScreen />}
        {screen === "budgets" && <BudgetsScreen />}
        {screen === "vertraege" && <VertraegeScreen />}
        {screen === "kontenverwaltung" && <KontenVerwaltungScreen />}
        {screen === "import" && <ImportBereich />}
        {screen === "training" && <TrainingBereich />}
        {screen === "einstellungen" && <EinstellungenScreen onSperren={sperren} />}
        </Fehlergrenze>
      </AppShell>
    </>
  );
}
