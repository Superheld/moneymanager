import { useEffect, useState } from "react";
import { AppShell, type ScreenId } from "./adapters/ui/AppShell";
import { HistorieScreen } from "./adapters/ui/HistorieScreen";
import { KontenScreen } from "./adapters/ui/KontenScreen";
import { KontenVerwaltungScreen } from "./adapters/ui/KontenVerwaltungScreen";
import { EinstellungenScreen } from "./adapters/ui/EinstellungenScreen";
import { VertraegeScreen } from "./adapters/ui/VertraegeScreen";
import { BudgetsScreen } from "./adapters/ui/BudgetsScreen";
import { InventarScreen } from "./adapters/ui/InventarScreen";
import { ImportBereich } from "./adapters/ui/ImportBereich";
import { TrainingBereich } from "./adapters/ui/TrainingBereich";
import { appBootstrap } from "./application/bootstrap";
import { sqliteKategorieRepository } from "./adapters/persistence/sqliteStammdatenRepositories";
import { EinstellungenProvider } from "./adapters/ui/EinstellungenProvider";

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("historie");
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    appBootstrap(sqliteKategorieRepository).finally(() => setBereit(true));
  }, []);

  if (!bereit) return null;

  return (
    <EinstellungenProvider>
      <AppShell current={screen} onNavigate={setScreen}>
        {screen === "historie" && <HistorieScreen />}
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
