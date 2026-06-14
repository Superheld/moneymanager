# Moneymanager — KI-Konzept

> **DDD-Ebene:** Referenz — Querschnittsthema (Stufe 1+ später) · **Status:** Konzept · **Stand:** 2026-06-13 · **Bezüge:** ROADMAP, TAKTIK-IMPORT
> Stand: 2026-06-07 · Ergänzt KONZEPT.md · Status: Diskussionsergebnis + Recherche

## 1. Prinzipien

1. **KI rechnet nie selbst.** Projektion, Rücklagen, Liquidität sind deterministische
   Engine-Arithmetik. KI ist Sensorik (Daten rein), Interface (Fragen/Antworten) und
   Verbalisierung (Zahlen → Sätze). Sie erfindet keine Zahlen.
2. **Vorschlagen, nicht handeln.** KI schreibt nie ungefragt in den Datenbestand.
   Jeder KI-Output ist ein Vorschlag mit Bestätigungs-Workflow (Review-Inbox).
3. **Optional, nie Pflicht.** Die App ist ohne KI voll funktionsfähig.
   Features schalten sich frei, wenn eine lokale Runtime verfügbar ist (Feature-Gating).
4. **Deterministisch vor generativ.** Was Statistik/Regeln können (Periodizitätserkennung,
   Anomalien, Beitragserhöhungen), bleibt Statistik/Regeln. Das LLM liefert nur die
   sprachliche Hülle und Fallbacks für Unschärfe.
5. **Lokal first.** Standard ist eine lokale Runtime; ein Cloud-Provider ist höchstens
   eine explizite Opt-in-Alternative.

## 2. Die vier Schichten

### Schicht 1: Erfassung (größter Hebel, erste Ausbaustufe)

| Use Case | Technik | Modellklasse |
|---|---|---|
| Buchungs-Kategorisierung (Fallback hinter Regeln) | Embeddings + Ähnlichkeitssuche gegen Kategorie-/Beispielvektoren | Embedding-Modell (klein, ~25 MB–2 GB) |
| Dokument rein, Vertrag raus: Police/Vertrags-PDF → Beitrag, Intervall, Kündigungsfrist, Risiken | Vision-LLM mit structured output (JSON-Schema) | Vision-Modell ~7B |
| Inventar-Erfassung: Gerätebeschreibung/Foto → Vorschlag Wiederbeschaffungswert + Nutzungsdauer | Text- oder Vision-LLM | 3–8B |
| Benennen erkannter wiederkehrender Zahlungen | Text-LLM (Erkennung selbst: deterministisch) | 3B reicht |

**Onboarding-Killer-Feature:** 30 Verträge per PDF-Stapel statt Abtippen.

### Schicht 2: Befragung

Natürlichsprachliche Fragen ("Was kostet mich Mobilität wirklich?").
Technik: LLM übersetzt Frage → Engine-/Query-Aufrufe → verbalisiert das Ergebnis
(Text-to-Query, nie Text-to-Zahl). Braucht Tool-Calling-fähiges Modell, eher 7–14B.

### Schicht 3: Ambient / proaktiv

Beitragserhöhung, totes Abo, Rückstellungs-Warnung (Abschläge vs. Vorjahr),
Vorsorgelücke, Monats-Briefing. Erkennung: Statistik + Regeln (zuverlässig, ohne KI).
LLM: macht daraus kontextuelle, verständliche Meldungen und den Monats-Digest.

### Schicht 4: Agentisch (späte Ausbaustufe)

Engine als Werkzeugsatz exponieren (`projiziere(…)`, `simuliere(…)`, `query(…)`) —
LLM orchestriert What-if-Szenarien ("Was, wenn ich auf 80 % reduziere und das Auto
erst 2028 ersetze?"). Die Simulation selbst ist ein Engine-Feature mit Eigenwert;
KI macht sie gesprächsfähig.

## 3. Technische Bausteine (Rechercheergebnis, Stand Mitte 2026)

### Runtime

- **Ollama** als optionale, externe Runtime ist der pragmatische Standard: ein Binary,
  Modellverwaltung eingebaut, OpenAI-kompatible API auf `localhost:11434/v1`,
  structured output und tool calling werden unterstützt.
- **llama.cpp eingebettet** wäre die Alternative ohne externe Abhängigkeit (inzwischen
  mit Autoparser für structured output und MCP-Client), kostet aber deutlich mehr
  Integrationsaufwand. Entscheidung kann spät fallen, wenn die Provider-Abstraktion steht.

### Modellklassen (austauschbar, nur Anforderungen festschreiben)

| Aufgabe | Anforderung | Kandidaten (Mitte 2026) | Ressourcen |
|---|---|---|---|
| Embeddings/Kategorisierung | mehrsprachig (deutsche Verwendungszwecke!) | bge-m3, multilingual-e5; minimal: MiniLM-Klasse | 25 MB–2 GB, CPU reicht |
| Text-Aufgaben (Benennen, Briefings) | structured output, Deutsch | Llama-3.2-3B-Klasse (~2 GB @ Q4) bis Qwen-7B-Klasse | 4–6 GB (V)RAM @ 7B Q4 |
| Befragung/Agentisch | tool calling, Deutsch | Gemma-4- / Qwen-Klasse 7–14B | ab ~8 GB |
| Dokument-Extraktion | Vision + DocVQA-stark + JSON-Schema | Qwen2.5-VL-7B-Klasse | ~6–8 GB |

Hardware-Realität: Apple Silicon (unified memory) und PCs ab 16 GB RAM bzw. 8 GB VRAM
decken alles bis 7B bequem ab; die Embedding-Schicht läuft praktisch überall.

## 4. Was das Kernsystem dafür mitbringen muss

Diese Anforderungen gelten ab dem MVP, auch wenn KI erst später kommt:

1. **Provider-Abstraktion:** ein internes AI-Interface gegen OpenAI-kompatible API;
   konkrete Runtime (Ollama, eingebettet, Cloud-Opt-in) ist Konfiguration.
2. **Vorschlags-Status im Datenmodell:** Kategorisierungen/erfasste Verträge haben
   `vorgeschlagen | bestätigt`; dazu eine Review-Inbox in der UI.
3. **Feedback-Loop:** Nutzerkorrekturen werden gespeichert und füttern zuerst die
   Regel-Engine (z. B. neue Regel aus Korrektur), dann die Beispielvektoren.
4. **Engine-API als Funktionskatalog:** Projektion, Simulation, Queries als saubere,
   parametrisierte Funktionen — Voraussetzung für Schicht 2 und 4 (und gute Architektur
   ohnehin).
5. **Dokumentenablage:** Original-PDFs/Fotos an Verträge/Inventar anhängbar —
   Voraussetzung für die Extraktion und für sich genommen nützlich.
6. **Feature-Gating:** App erkennt verfügbare Runtime/Modelle und blendet KI-Features
   entsprechend ein/aus.

## 5. Roadmap-Zuordnung

| Stufe | Inhalt | Abhängigkeit |
|---|---|---|
| 0 (MVP) | Alles deterministisch: Regeln, Periodizitätserkennung, statistische Hinweise. Plus die Vorbereitungen aus Abschnitt 4. | keine |
| 1 | Embeddings-Kategorisierung als Fallback | Embedding-Modell, läuft fast überall |
| 2 | Dokument-Extraktion (Verträge, Inventar) | Vision-Modell ~7B |
| 3 | Befragung + Monats-Briefing | 7–14B mit tool calling |
| 4 | Agentische Szenarien | Engine-Funktionskatalog + Stufe 3 |

## 6. Quellen (Recherche 2026-06)

- [Best Local LLM Models 2026 (sitepoint)](https://www.sitepoint.com/best-local-llm-models-2026/)
- [Best Ollama Models 2026 (localaimaster)](https://localaimaster.com/blog/best-ollama-models)
- [Sentence transformers für Transaktions-Kategorisierung (expensesorted)](https://www.expensesorted.com/blog/advanced-bank-transaction-categorization-methods-2025)
- [Lokale Finanzanalyse mit LLMs (Medium)](https://padulaguruge.medium.com/analyzing-personal-finances-locally-with-ai-using-llms-and-python-panel-for-secure-expense-eb0f3831517c)
- [Qwen2.5-VL lokal für Dokumente (labellerr)](https://www.labellerr.com/blog/run-qwen2-5-vl-locally/)
- [Qwen2.5-VL Technical Report (arXiv)](https://arxiv.org/abs/2502.13923)
- [BGE-M3 vs. multilingual-E5 (knightli)](https://knightli.com/en/2026/04/23/compare-openai-bge-e5-gte-jina-embedding-models/)
- [Ollama vs. llama.cpp (kunalganglani)](https://www.kunalganglani.com/blog/ollama-vs-llama-cpp)
- [Running LLMs Locally (daily.dev)](https://daily.dev/blog/running-llms-locally-ollama-llama-cpp-self-hosted-ai-developers/)
