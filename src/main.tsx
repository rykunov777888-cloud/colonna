import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BuildingProvider } from "./building/context";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BuildingProvider>
      <App />
    </BuildingProvider>
  </StrictMode>,
);
