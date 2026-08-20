import { useEffect, useState } from "react";
import { AppShell, type ScreenId } from "./adapters/ui/bausteine/AppShell";
import { UebersichtScreen } from "./adapters/ui/uebersicht/UebersichtScreen";
import { AnalyseScreen } from "./adapters/ui/analyse/AnalyseScreen";
import { KontenScreen } from "./adapters/ui/konten/KontenScreen";
import { KontenVerwaltungScreen } from "./adapters/ui/konten/KontenVerwaltungScreen";
import { EinstellungenScreen } from "./adapters/ui/einstellungen/EinstellungenScreen";
import { VertraegeScreen } from "./adapters/ui/vertraege/VertraegeScreen";
import { BudgetsScreen } from "./adapters/ui/budgets/BudgetsScreen";
import { InventarScreen } from "./adapters/ui/inventar/InventarScreen";
import { ImportBereich } from "./adapters/ui/import/ImportBereich";
import { TrainingBereich } from "./adapters/ui/training/TrainingBereich";
import { appBootstrap } from "./application/bootstrap";
import { sqliteKategorieRepository } from "./adapters/persistence/sqliteStammdatenRepositories";
import { EinstellungenProvider } from "./adapters/ui/bausteine/EinstellungenProvider";

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("uebersicht");
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    appBootstrap(sqliteKategorieRepository).finally(() => setBereit(true));
  }, []);

  if (!bereit) return null;

  return (
    <EinstellungenProvider>
      <AppShell current={screen} onNavigate={setScreen}>
        {screen === "uebersicht" && <UebersichtScreen />}
        {screen === "analyse" && <AnalyseScreen />}
        {screen === "konten" && <KontenScreen onNavigate={setScreen} />}
        {screen === "inventar" && <InventarScreen />}
        {screen === "budgets" && <BudgetsScreen />}
        {screen === "vertraege" && <VertraegeScreen />}
        {screen === "kontenverwaltung" && <KontenVerwaltungScreen />}
        {screen === "import" && <ImportBereich />}
        {screen === "training" && <TrainingBereich />}
        {screen === "einstellungen" && <EinstellungenScreen />}
      </AppShell>
    </EinstellungenProvider>
  );
}
