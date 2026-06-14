# ADR-0001 — Plattform & UI-Stack

> **DDD-Ebene:** Entscheidung — ADR-Serie · **Status:** Akzeptiert · **Stand:** 2026-06-13 · **Bezüge:** KONZEPT, BAUPLAN-MVP, BUCHUNGSPACKAGE-ANFORDERUNGEN

> Status: **Akzeptiert** · 2026-06-13 · ROADMAP NEXT #3 · Entscheider: Bruce + Claude
> Architecture Decision Record. Format: Kontext → Entscheidung → Begründung → Konsequenzen →
> Alternativen → Folgeentscheidungen.

## Kontext

- **Lokal first** ist Leitprinzip (KONZEPT §2): alle Daten auf dem Gerät, keine Cloud-Pflicht.
  MVP = ein Rechner, ein Zugang.
- Die Datenhaltung soll **gekapselt** bleiben, damit später ein **lokaler Server + Browser**
  (Haushalts-Sync) und evtl. **mobil** möglich sind, ohne den Kern umzubauen
  (KONZEPT §2.5/§8, ROADMAP Stufe 3).
- Das **Buchungspackage** ist ein separates Projekt mit **language-agnostischer**
  Schnittstelle (A1 Rechenwerk als pure functions, A5 Buchungsformat als Published Language);
  Need-by erst zum Ist-Schritt, Contingency: Mock gegen das A5-Schema.
- Das taktische Design ist bereits **hexagonal** angelegt (TAKTIK-PLANUNG §6): Domäne ohne
  Abhängigkeit zu Persistenz/Ledger, Anbindung über Ports.
- Nutzervorgabe: lokale App, **React**.

## Entscheidung

1. **Lokale Desktop-App** — kein Cloud-/Server-Zwang.
2. **UI: React + TypeScript.**
3. **Hülle: Tauri (v2)** — system-eigener WebView + schlanke Rust-Hülle.
4. **Domänenkern als portables TypeScript-Modul** (hexagonal): Projektion, Deckung, Matching
   als pure functions; kennt weder Tauri noch Persistenz noch Ledger direkt (Ports/Adapter).
5. **Buchungspackage-Anbindung über einen Port**, konkret als **WASM-Modul oder Sidecar-Prozess**
   — hält die Sprache des Packages offen. Bis dahin Mock gegen das A5-Schema.
6. **Persistenz lokal** (z. B. SQLite via Tauri-Plugin) hinter einem Repository-Port —
   austauschbar.

## Begründung

- **Tauri schlägt Electron** auf genau den Achsen, die hier zählen: ~3–10 MB statt 80–200 MB
  Bundle, ~30 MB statt ~200 MB RAM, kleinere Angriffsfläche. Das passt zu „lokal first" und zu
  einer daten-, nicht renderinglastigen App.
- **Tauri 2 öffnet später Mobile** aus einer Codebasis — die Stufe-3-Ambition (Mobile-Frage)
  bleibt erreichbar, ohne heute darauf zu optimieren.
- **Rust bleibt dünn** (Fenster, Dateizugriff, Sidecar). Die Fachlogik ist React/TypeScript —
  für das Team zugänglich.
- **Portabler TS-Kern** schützt die Option „lokaler Server + Browser" (gleicher Kern, anderer
  Adapter) und macht den Kern isoliert unit-testbar — passt zum pure-function-Design der Core
  Domain.

## Konsequenzen

**Positiv:** schlanke App; klare Trennung Kern ↔ Hülle; Mobile- und Server-Pfad bleiben offen;
Kern testbar ohne Hülle; Anbindung des Packages sprachneutral.

**Preis / negativ:** Die **Rust-Toolchain** ist Build-Voraussetzung (auch bei wenig eigenem
Rust). Der **system-WebView** rendert je OS leicht unterschiedlich — für eine formular-/
datenlastige App unkritisch, aber zu beachten. Das **Tauri-Ökosystem** ist kleiner als das von
Electron (mehr Eigenbau bei Randfällen, z. B. Auto-Update einplanen).

**Mitigation:** auf gängige, gut unterstützte UI-Bausteine setzen (WebView-Unterschiede klein
halten); Tauri-Updater früh einplanen; Sidecar/WASM-Grenze zum Package sauber als Port führen.

## Alternativen (verworfen)

- **Electron** — reifer und „JS überall", aber ~25× größer und deutlich RAM-hungriger;
  widerspricht „lokal first"/schlank und hat keinen eigenen Mobile-Pfad.
- **React Native (Desktop)** — eigentlich mobil-fokussiert; für eine daten-/formularlastige
  Desktop-Finanz-App schwächeres Desktop-Ökosystem.
- **Sofort lokaler Server + Browser** — unnötige Betriebskomplexität fürs Solo-MVP; bleibt durch
  den portablen Kern später ohne Bruch möglich.

## Folgeentscheidungen (offen, beim Bau)

- Konkrete Persistenz: SQLite-Plugin vs. Datei.
- React-State-Management / UI-Bibliothek (WebView-freundliche Bausteine bevorzugen).
- Package-Anbindung **WASM vs. Sidecar** — sobald das A5-Schema steht.
