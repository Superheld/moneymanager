import { useEffect, useState } from "react";
import { AppShell, type ScreenId } from "./adapters/ui/AppShell";
import { UeberblickScreen } from "./adapters/ui/UeberblickScreen";
import { StammdatenScreen } from "./adapters/ui/StammdatenScreen";
import { VertraegeScreen } from "./adapters/ui/VertraegeScreen";
import { BudgetsScreen } from "./adapters/ui/BudgetsScreen";
import { ToepfeScreen } from "./adapters/ui/ToepfeScreen";
import { DeckungScreen } from "./adapters/ui/DeckungScreen";
import { appBootstrap } from "./application/bootstrap";
import { sqliteKategorieRepository } from "./adapters/persistence/sqliteStammdatenRepositories";

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("uebersicht");
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    appBootstrap(sqliteKategorieRepository).finally(() => setBereit(true));
  }, []);

  if (!bereit) return null;

  return (
    <AppShell current={screen} onNavigate={setScreen}>
      {screen === "uebersicht" && <UeberblickScreen />}
      {screen === "toepfe" && <ToepfeScreen />}
      {screen === "budgets" && <BudgetsScreen />}
      {screen === "vertraege" && <VertraegeScreen />}
      {screen === "deckung" && <DeckungScreen />}
      {screen === "stammdaten" && <StammdatenScreen />}
    </AppShell>
  );
}
