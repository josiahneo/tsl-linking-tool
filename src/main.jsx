import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import TSLInternalLinker from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TSLInternalLinker />
    <Analytics />
  </StrictMode>
);
