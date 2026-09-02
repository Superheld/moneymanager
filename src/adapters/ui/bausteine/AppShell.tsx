// App-Shell — Navigation und Inhaltsfläche. Minimale Navigation per State (kein
// Router-Dep, solange es wenige Screens sind). Aktive Screens sind klickbar; spätere
// Bereiche (BAUPLAN P2+) sind als deaktiviert sichtbar.
//
// **Seit 2026-09-02 mobile first.** Die Grundform ist die schmale: eine Kopfleiste mit
// einem Griff, und die Navigation liegt als Schublade links AUSSERHALB des Bildes. Erst
// ab 700 px rückt sie als feste Spalte ins Raster (siehe app.css, „Die Navigation in drei
// Stufen").
//
// **Damit hat die Shell zum ersten Mal einen Zustand**, und das ist ein Bruch mit der
// Begründung, die hier lange stand: die Einklapp-Stufe kommt ohne JavaScript aus, weil
// die Fensterbreite eine Frage ist, die CSS selbst beantwortet. „Ist die Schublade
// offen?" ist keine solche Frage — sie hängt an einer Handlung, nicht an einer Breite.
// Ein reines CSS-Konstrukt dafür (Checkbox plus `:checked`) hätte den Zustand nur
// versteckt und wäre für Tastatur und Screenreader eine Kaschierung geblieben.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { APP_STADIUM, APP_VERSION } from "../../../version";
import { AktualisierungKnopf } from "./AktualisierungKnopf";
import { Icon } from "./IconButton";

export type ScreenId =
  | "uebersicht"
  | "analyse"
  | "konten"
  | "ruecklagen"
  | "budgets"
  | "vertraege"
  | "kontenverwaltung"
  | "import"
  | "training"
  | "einstellungen";

interface NavEntry {
  id?: ScreenId;
  labelKey: string;
}

interface NavGroup {
  titelKey: string;
  eintraege: NavEntry[];
}

const GRUPPEN: NavGroup[] = [
  {
    titelKey: "shell.gruppeUeberblick",
    eintraege: [
      // Getrennt seit 2026-08-19: „Übersicht" zeigt, was JETZT gilt (drei Monatskarten
      // plus die Budgets des laufenden Monats), „Analyse" wertet Zeiträume aus. Vorher
      // war beides ein Screen, und die Kategorien standen ganz unten.
      // Der frühere Bereich „Planung" (Jahresprojektion, Szenarien) und „Deckung" sind
      // 2026-08-16 entfallen — sie kommen wieder, dann aber anders geschnitten.
      { id: "uebersicht", labelKey: "shell.navUebersicht" },
      { id: "konten", labelKey: "shell.navKonten" },
      { id: "budgets", labelKey: "shell.navBudgets" },
      { id: "analyse", labelKey: "shell.navAnalyse" },
      { id: "ruecklagen", labelKey: "shell.navRuecklagen" },
      { id: "vertraege", labelKey: "shell.navVertraege" },
    ],
  },
  {
    titelKey: "shell.gruppeVerwaltung",
    eintraege: [
      { id: "kontenverwaltung", labelKey: "shell.navKontenVerwalten" },
      { id: "import", labelKey: "shell.navImport" },
      { id: "training", labelKey: "shell.navTraining" },
      { id: "einstellungen", labelKey: "shell.navEinstellungen" },
    ],
  },
];

/**
 * Der Beschriftungsschlüssel eines Bereichs — aus derselben Tabelle, aus der die
 * Navigation lebt. Eine zweite Zuordnung „ScreenId → Titel" wäre eine Stelle mehr, die
 * beim nächsten Bereich vergessen wird; genau darum heissen auch die Icons wie die
 * `ScreenId`.
 */
function labelKeyVon(id: ScreenId): string {
  for (const g of GRUPPEN) {
    for (const e of g.eintraege) if (e.id === id) return e.labelKey;
  }
  return "shell.navUebersicht";
}

export function AppShell({
  current,
  onNavigate,
  children,
  versteckt,
}: {
  current: ScreenId;
  onNavigate: (id: ScreenId) => void;
  children: ReactNode;
  /**
   * Bereiche, die gerade nicht in der Navigation stehen.
   *
   * Sie werden AUSGEBLENDET und nicht ausgegraut: ein Eintrag, den man sieht und nicht
   * anklicken kann, wirft eine Frage auf, die die Navigation nicht beantworten kann.
   * Wo der Schalter dafür sitzt, sagt der Ort, an dem er sitzt.
   */
  versteckt?: readonly ScreenId[];
}) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  const griff = useRef<HTMLButtonElement>(null);

  // Escape schliesst die Schublade — aber nur sie: liegt ein Modal darüber, hat der
  // oberste Dialog die Taste schon verbraucht (siehe `Modal`, `defaultPrevented`).
  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setOffen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offen]);

  /**
   * Ein Klick auf einen Eintrag schliesst mit.
   *
   * Ohne das bliebe auf dem Handy die Schublade über dem Bereich stehen, den sie gerade
   * geöffnet hat — der Erfolg der Handlung wäre unsichtbar. Der Fokus geht dabei zurück
   * auf den Griff: er ist das Element, das nach dem Schliessen sichtbar an derselben
   * Stelle steht.
   */
  const schliessen = () => {
    setOffen(false);
    griff.current?.focus();
  };

  return (
    <div className="app">
      {/* Nur schmal sichtbar. Sie trägt den Griff und den Namen des Bereichs — auf einem
          Handy ist die Marke nicht die Auskunft, die man beim Blick nach oben braucht. */}
      <header className="topbar">
        <button
          ref={griff}
          type="button"
          className="topbar-griff"
          aria-label={t("shell.menueOeffnen")}
          aria-expanded={offen}
          aria-controls="hauptnavigation"
          onClick={() => setOffen(true)}
        >
          <Icon name="menue" groesse={20} />
        </button>
        <span className="topbar-titel">{t(labelKeyVon(current))}</span>
      </header>

      {/* Die Fläche neben der offenen Schublade. Sie schliesst beim Antippen und ist
          zugleich das, was die Schublade als „darüberliegend" lesbar macht. */}
      <div className="side-scrim" data-offen={offen} onClick={schliessen} aria-hidden />

      <aside className="side" id="hauptnavigation" data-offen={offen}>
        <div className="brand">
          <div className="mk">M</div>
          <div className="lbl">
            <div className="nm">Moneymanager</div>
            <div className="sub">{t("shell.brandSub")}</div>
          </div>
          {/* Ein sichtbarer Weg zurück. Der Scrim allein reicht auf einem Handy nicht:
              die Schublade nimmt fast die ganze Breite, und die Fläche daneben ist ein
              Streifen, den man nicht als Bedienteil liest. */}
          <button type="button" className="side-zu" aria-label={t("shell.menueSchliessen")} onClick={schliessen}>
            <Icon name="verwerfen" groesse={18} />
          </button>
        </div>

        {GRUPPEN.map((g) => (
          <div key={g.titelKey}>
            <span className="nlbl">{t(g.titelKey)}</span>
            <nav className="nav">
              {g.eintraege
                .filter((e) => !e.id || !versteckt?.includes(e.id))
                .map((e) => {
                const aktiv = e.id === current;
                const klickbar = !!e.id;
                return (
                  <a
                    key={e.labelKey}
                    className={[aktiv ? "on" : "", klickbar ? "" : "disabled"].join(" ").trim()}
                    // Der Titel traegt den Namen IMMER, nicht nur bei gesperrten
                    // Eintraegen: schmal eingeklappt ist das Icon alles, was bleibt,
                    // und ein Icon ohne Namen ist ein Raetsel.
                    title={klickbar ? t(e.labelKey) : t("shell.spaeterePhase")}
                    onClick={
                      klickbar
                        ? () => {
                            onNavigate(e.id!);
                            setOffen(false);
                          }
                        : undefined
                    }
                  >
                    {e.id ? <Icon name={e.id} groesse={17} /> : <span className="dot" />}
                    <span className="lbl">{t(e.labelKey)}</span>
                  </a>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="foot">
          {/* Das Stadium steht neben der Version, nicht darin: wer hier hinsieht, soll
              wissen, dass Schema und Daten noch nicht festgeschrieben sind. */}
          <div>
            Moneymanager {APP_VERSION} <span className="bdg">{APP_STADIUM}</span>
          </div>
          <div>{t("shell.footLokal")}</div>
          {/* Erscheint nur, wenn wirklich etwas bereitliegt — sonst rendert er nichts. */}
          <AktualisierungKnopf />
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
