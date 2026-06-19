import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n/i18n"; // i18next initialisieren (Seiteneffekt), bevor Komponenten rendern
import "./styles/tokens.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
