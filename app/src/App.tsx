import { useState } from "react";
import { AppShell, type ScreenId } from "./adapters/ui/AppShell";
import { UeberblickScreen } from "./adapters/ui/UeberblickScreen";
import { StammdatenScreen } from "./adapters/ui/StammdatenScreen";
import { VertraegeScreen } from "./adapters/ui/VertraegeScreen";
import { BudgetsScreen } from "./adapters/ui/BudgetsScreen";
import { ToepfeScreen } from "./adapters/ui/ToepfeScreen";

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("uebersicht");
  return (
    <AppShell current={screen} onNavigate={setScreen}>
      {screen === "uebersicht" && <UeberblickScreen />}
      {screen === "toepfe" && <ToepfeScreen />}
      {screen === "budgets" && <BudgetsScreen />}
      {screen === "vertraege" && <VertraegeScreen />}
      {screen === "stammdaten" && <StammdatenScreen />}
    </AppShell>
  );
}
