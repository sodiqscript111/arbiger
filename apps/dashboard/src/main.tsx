import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./state/auth";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
