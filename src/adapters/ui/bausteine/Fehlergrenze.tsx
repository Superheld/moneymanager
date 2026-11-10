// Die Fehlergrenze — was zu sehen ist, wenn eine Komponente beim Rendern wirft.
//
// **Ohne sie ist die Antwort: nichts.** React hängt bei einem Fehler im Rendern den ganzen
// Baum ab, und übrig bleibt eine weisse Seite ohne Meldung. In einer App, die Geld
// verwaltet, ist das die beunruhigendste denkbare Auskunft — sie sieht aus wie „alles
// weg", obwohl der Bestand unberührt dasteht und nur ein Screen nicht zeichnen konnte.
// Bis 2026-11-10 gab es im ganzen Projekt keine.
//
// **Was sie fängt und was nicht.** Fehler beim RENDERN und in Lifecycle-Methoden der
// Komponenten unter ihr. Nicht: Fehler in Ereignisbehandlern und in asynchronem Code —
// ein abgelehntes `await` in einem Klick läuft an ihr vorbei. Dort bleibt es bei dem, was
// der jeweilige Screen selbst meldet (`fehlerNachricht`).
//
// **Sie steht an zwei Stellen**, und der Unterschied ist die Reichweite: um den Inhalt
// eines Screens (die Navigation bleibt stehen, man kommt woanders hin) und um die ganze
// App (für alles, was vorher schiefgeht — Sperrbildschirm, Rahmen).
//
// Eine Klasse, weil React Fehlergrenzen nur als Klasse kennt; es ist die einzige im
// Projekt.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
  /**
   * Wechselt dieser Wert, wird der Fehler vergessen und neu gezeichnet. Für die Grenze
   * um einen Screen ist das die `ScreenId`: wer woanders hinnavigiert, soll dort
   * ankommen und nicht weiter vor der Meldung des vorigen Screens stehen.
   */
  ruecksetzenBei?: unknown;
}

interface Zustand {
  fehler: Error | null;
}

export class Fehlergrenze extends Component<Props, Zustand> {
  state: Zustand = { fehler: null };

  static getDerivedStateFromError(fehler: unknown): Zustand {
    return { fehler: fehler instanceof Error ? fehler : new Error(String(fehler)) };
  }

  componentDidCatch(fehler: Error, info: ErrorInfo): void {
    // In die Konsole und nirgends sonst hin: die App spricht nicht nach draussen
    // (Wurzel-`CLAUDE.md`), also gibt es auch keinen Absturzbericht, der es täte.
    console.error("Fehler beim Zeichnen:", fehler, info.componentStack);
  }

  componentDidUpdate(vorher: Props): void {
    if (this.state.fehler && vorher.ruecksetzenBei !== this.props.ruecksetzenBei) {
      this.setState({ fehler: null });
    }
  }

  render(): ReactNode {
    if (!this.state.fehler) return this.props.children;
    return (
      <Fehleranzeige
        fehler={this.state.fehler}
        nochmal={() => this.setState({ fehler: null })}
      />
    );
  }
}

/**
 * Was statt des Screens dasteht.
 *
 * Drei Aussagen, in dieser Reihenfolge: es ist etwas schiefgegangen, deine Daten sind
 * davon nicht berührt, und so geht es weiter. Die mittlere ist die wichtigste und
 * stimmt auch — gezeichnet wird aus dem Bestand, geschrieben wird beim Zeichnen nie.
 *
 * Die technische Meldung steht darunter, klein: sie ist für den, der den Fehler meldet,
 * nicht für den, der ihn erlebt.
 */
function Fehleranzeige({ fehler, nochmal }: { fehler: Error; nochmal: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="fehlergrenze">
      <h2>{t("fehlergrenze.titel")}</h2>
      <p>{t("fehlergrenze.text")}</p>
      <div className="fehlergrenze-knoepfe">
        <Button variant="primary" onClick={nochmal}>
          {t("fehlergrenze.nochmal")}
        </Button>
        <Button onClick={() => window.location.reload()}>{t("fehlergrenze.neuLaden")}</Button>
      </div>
      <p className="muted fehlergrenze-technisch">
        {t("fehlergrenze.technisch")} {fehler.message}
      </p>
    </div>
  );
}
