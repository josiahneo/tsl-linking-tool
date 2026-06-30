import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TSLInternalLinker from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TSLInternalLinker />
  </StrictMode>
);
