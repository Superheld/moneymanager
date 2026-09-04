// Zeilen-Aktionen als Icon statt als Textlink.
//
// Warum: in einer Tabelle standen bisher zwei bis vier Textlinks pro Zeile
// („bearbeiten · löschen · entnehmen"). Bei 25 Zeilen ist das eine Wortwand, die mit
// den Daten um Aufmerksamkeit konkurriert, und die Spaltenbreite hing an der Länge
// deutscher Verben. Ein Icon ist immer gleich breit und tritt zurück, bis man es sucht.
//
// Der Text verschwindet NICHT — er wandert in `title` (Tooltip) und `aria-label`
// (Screenreader, und damit auch die Tests, die nach `getByLabelText`/`getByTitle`
// suchen). Ein Icon ohne Namen wäre ein Rätsel; hier ist es eine Abkürzung.
//
// Die Icons sind Inline-SVG, kein Icon-Paket: die App läuft in einer WebView ohne Netz,
// jede externe Schrift oder Sprite-Datei wäre eine Abhängigkeit für zwölf Pfade.
// Gezeichnet auf 24×24, `stroke="currentColor"` — die Farbe kommt vom Button.

import type { CSSProperties, ReactElement, ReactNode } from "react";

export type IconName =
  | "bearbeiten"
  | "loeschen"
  | "details"
  | "regel"
  | "entnehmen"
  | "uebernehmen"
  | "verwerfen"
  | "oeffnen"
  // Der Griff zur Navigation — er steht in der Kopfleiste und nicht in der Liste, und
  // deshalb ist die Aehnlichkeit zu `einstellungen` (Schieberegler: dieselben drei
  // Striche, mit Griffen darauf) keine Verwechslungsgefahr: die beiden stehen nie
  // nebeneinander.
  | "menue"
  // Die Navigation. Sie heissen wie die `ScreenId`, damit die Sidebar sie ohne
  // Umsetzungstabelle nachschlagen kann — eine Tabelle mehr waere eine Stelle mehr,
  // die beim naechsten Bereich vergessen wird.
  | "uebersicht"
  | "konten"
  | "budgets"
  | "analyse"
  | "ruecklagen"
  | "vertraege"
  | "kontenverwaltung"
  | "import"
  | "training"
  | "einstellungen";

/** Die Pfade je Icon — 24×24, nur Striche, kein Fill. */
const PFADE: Record<IconName, ReactElement> = {
  // Stift
  bearbeiten: <><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></>,
  // Papierkorb
  loeschen: <><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  // Lupe über einem Beleg
  details: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  // Trichter — die Erkennungsregel filtert
  regel: <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />,
  // Pfeil aus dem Topf heraus
  entnehmen: <><path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M4 18h16" /></>,
  // Haken
  uebernehmen: <path d="M5 13l4 4L19 7" />,
  // Kreuz
  verwerfen: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  // Pfeil nach rechts in ein Fenster
  oeffnen: <><path d="M14 4h6v6" /><path d="M20 4l-8 8" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  // Drei Striche.
  menue: <path d="M4 7h16M4 12h16M4 17h16" />,

  // --- Navigation ---
  // Vier Kacheln — der Blick auf alles auf einmal.
  uebersicht: <><path d="M4 4h6v6H4z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6H4z" /><path d="M14 14h6v6h-6z" /></>,
  // Karte mit Streifen.
  konten: <><path d="M3 6h18v12H3z" /><path d="M3 10.5h18" /></>,
  // Ein Rahmen mit gefuelltem Sockel — dasselbe Bild wie im App-Icon: Verbrauch im
  // Rahmen. Die FUELLUNG ist hier ein bewusster Bruch mit „nur Striche": als blosse
  // Querlinie war das Icon von `konten` (Karte mit Streifen) kaum zu unterscheiden,
  // und zwei fast gleiche Icons in einer Leiste, in der man schnell klickt, sind
  // schlimmer als eine Ausnahme in der Zeichenregel.
  budgets: <><path d="M6 4h12v16H6z" /><path d="M7.4 13.2h9.2v5.4H7.4z" fill="currentColor" stroke="none" /></>,
  // Verlaufslinie.
  analyse: <><path d="M4 18l5-6 4 3 7-8" /><path d="M4 4v16h16" /></>,
  // Kiste in Schraegsicht.
  ruecklagen: <><path d="M3 8l9-4 9 4v8l-9 4-9-4V8Z" /><path d="M3 8l9 4 9-4" /><path d="M12 12v8" /></>,
  // Blatt mit umgeknickter Ecke.
  vertraege: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  // Gebaeude mit Saeulen.
  kontenverwaltung: <><path d="M3 9l9-5 9 5" /><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9" /><path d="M3 20h18" /></>,
  // Pfeil hinunter in eine Ablage.
  "import": <><path d="M12 3v10" /><path d="M8 9l4 4 4-4" /><path d="M4 16v4h16v-4" /></>,
  // Etikett mit Loch — das Einsortieren.
  training: <><path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19 4 12.5Z" /><circle cx="8.5" cy="8.5" r="1.3" /></>,
  // Schieberegler.
  einstellungen: <><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="1.9" /><circle cx="15" cy="12" r="1.9" /><circle cx="7" cy="17" r="1.9" /></>,
};

export function Icon({ name, groesse = 16 }: { name: IconName; groesse?: number }) {
  return (
    <svg
      aria-hidden
      width={groesse}
      height={groesse}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      {PFADE[name]}
    </svg>
  );
}

/**
 * Eine Zeilen-Aktion. `label` ist Pflicht und wird nicht angezeigt, sondern benannt —
 * ohne ihn gäbe es die Aktion für Tastatur und Screenreader nicht.
 *
 * `ton="gefahr"` färbt erst beim Hovern rot: eine Tabelle voller roter Papierkörbe liest
 * sich, als sei überall etwas kaputt.
 */
export function IconButton({
  icon,
  label,
  onClick,
  ton = "normal",
  disabled,
  style,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  ton?: "normal" | "gefahr";
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className={ton === "gefahr" ? "iconbtn iconbtn-gefahr" : "iconbtn"}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={style}
    >
      <Icon name={icon} />
    </button>
  );
}

/** Mehrere Zeilen-Aktionen nebeneinander, ohne dass jede Tabelle das Grid neu erfindet. */
export function IconLeiste({ children }: { children: ReactNode }) {
  return <span style={{ display: "inline-flex", gap: 2, alignItems: "center", justifyContent: "flex-end" }}>{children}</span>;
}
