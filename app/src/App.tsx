import { useEffect, useState } from "react";
import { AppShell, type ScreenId } from "./adapters/ui/AppShell";
import { UeberblickScreen } from "./adapters/ui/UeberblickScreen";
import { HistorieScreen } from "./adapters/ui/HistorieScreen";
import { KontenScreen } from "./adapters/ui/KontenScreen";
import { EinstellungenScreen } from "./adapters/ui/EinstellungenScreen";
import { VertraegeScreen } from "./adapters/ui/VertraegeScreen";
import { BudgetsScreen } from "./adapters/ui/BudgetsScreen";
import { ToepfeScreen } from "./adapters/ui/ToepfeScreen";
import { InventarScreen } from "./adapters/ui/InventarScreen";
import { DeckungScreen } from "./adapters/ui/DeckungScreen";
import { ImportScreen } from "./adapters/ui/ImportScreen";
import { ReviewScreen } from "./adapters/ui/ReviewScreen";
import { appBootstrap } from "./application/bootstrap";
import { sqliteKategorieRepository } from "./adapters/persistence/sqliteStammdatenRepositories";
import { EinstellungenProvider } from "./adapters/ui/EinstellungenProvider";

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
        {screen === "uebersicht" && <UeberblickScreen />}
        {screen === "historie" && <HistorieScreen />}
        {screen === "konten" && <KontenScreen onNavigate={setScreen} />}
        {screen === "toepfe" && <ToepfeScreen />}
        {screen === "inventar" && <InventarScreen />}
        {screen === "budgets" && <BudgetsScreen />}
        {screen === "vertraege" && <VertraegeScreen />}
        {screen === "deckung" && <DeckungScreen />}
        {screen === "import" && <ImportScreen />}
        {screen === "review" && <ReviewScreen />}
        {screen === "einstellungen" && <EinstellungenScreen />}
      </AppShell>
    </EinstellungenProvider>
  );
}
