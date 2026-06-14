# UI-Kit — Übersicht

Der Start-/Übersichts-Screen von Moneymanager im finalen Design (Richtung 02, Fokus-Layout
mit flacher Farbgebung). Zeigt die App-Shell (Sidebar + Inhalt) und das asymmetrische
Layout: breiter Hero links (Fokus-Zahl „Verfügbar heute", Klartext-Lage, drei Kennzahlen-
Chips, Jahresverlauf Ist/Plan), schmale ruhige Spalte rechts (Zahlungen, Budgets, Hinweise).

- `index.html` — vollständiger Screen, verlinkt `../../styles.css` (echte Tokens).

Verwendete System-Bausteine (visuell): NavItem, KPIStat (hero + chip), Pill (Umschichtung),
CoverageTrack (Budgets), Card-Flächen. Chart-Sprache: **Ist = solide Ink**, **Plan =
gestrichelt Teal**, „heute"-Linie + Engpass-Punkt in Amber.
