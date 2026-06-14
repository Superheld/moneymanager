import { useState } from "react";
import { AppShell, type ScreenId } from "./adapters/ui/AppShell";
import { UeberblickScreen } from "./adapters/ui/UeberblickScreen";
import { StammdatenScreen } from "./adapters/ui/StammdatenScreen";
import { VertraegeScreen } from "./adapters/ui/VertraegeScreen";

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("uebersicht");
  return (
    <AppShell current={screen} onNavigate={setScreen}>
      {screen === "uebersicht" && <UeberblickScreen />}
      {screen === "vertraege" && <VertraegeScreen />}
      {screen === "stammdaten" && <StammdatenScreen />}
    </AppShell>
  );
}
