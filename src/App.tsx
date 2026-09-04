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
import { appBootstrap } from "./application/bootstrap";
import { sqliteKategorieRepository } from "./adapters/persistence/sqliteStammdatenRepositories";
import { EinstellungenProvider } from "./adapters/ui/bausteine/EinstellungenProvider";
import { Sperrbildschirm } from "./adapters/ui/zugang/Sperrbildschirm";
import { useZeitsperre } from "./adapters/ui/zugang/useZeitsperre";
import {
  experimente as experimenteStand,
  zeitsperre,
  zugangEinrichten,
  zugangEntsperren,
  zugangMitCode,
  zugangsstand,
  zugangSperren,
} from "./adapters/dienste";
import { EXPERIMENTE_AUS, type Experimente } from "./application";
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
  /**
   * Der Stand der Experimente. Er entscheidet, welche Bereiche in der Navigation stehen.
   *
   * Ausgangswert ist „alles aus" — dieselbe vorsichtige Voreinstellung wie im Kern. Ein
   * Bereich, der beim Laden kurz auftaucht und dann verschwindet, sähe nach einem Fehler
   * aus.
   */
  const [experimente, setExperimente] = useState<Experimente>(EXPERIMENTE_AUS);

  const standHolen = useCallback(async () => {
    const s = await zugangsstand();
    if (!s.eingerichtet) return setStand({ art: "einrichten", altbestand: s.altbestand });
    if (!s.offen) return setStand({ art: "entsperren" });
    setStand({ art: "offen" });
  }, []);

  useEffect(() => {
    void standHolen();
  }, [standHolen]);

  // Bootstrap und Zeitsperre-Einstellung erst NACH dem Entsperren — beide reden mit der
  // Datenbank.
  useEffect(() => {
    if (stand.art !== "offen") return;
    let abgebrochen = false;
    void (async () => {
      await appBootstrap(sqliteKategorieRepository).catch(() => {});
      const [m, e] = await Promise.all([
        zeitsperre().catch(() => 0),
        experimenteStand().catch(() => EXPERIMENTE_AUS),
      ]);
      if (!abgebrochen) {
        setMinuten(m);
        setExperimente(e);
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
      {/* Das Training ist ein EXPERIMENT (Wunsch 2026-08-31): es ist eine Werkbank,
          kein fertiger Bereich — man greift dort in die Merkmale ein, misst Varianten
          und trainiert neu. Ausgeliefert wird ein fertiges Modell; wer es selbst
          anfassen will, schaltet den Bereich in den Einstellungen zu. */}
      <AppShell
        current={screen}
        onNavigate={setScreen}
        versteckt={experimente.training ? [] : ["training"]}
      >
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
      </AppShell>
    </EinstellungenProvider>
  );
}
