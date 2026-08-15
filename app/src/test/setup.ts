// Globales Test-Setup für die UI-Tests: jest-dom-Matcher (toBeInTheDocument etc.) und
// Aufräumen nach jedem Test. Nur für Dateien mit jsdom-Umgebung relevant.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
