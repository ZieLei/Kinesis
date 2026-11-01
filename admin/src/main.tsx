
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

import { AuthProvider } from "./auth/AuthProvider";
import AdminApplication from "./auth/AdminApplication";


const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Could not find the application root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider>
      <AdminApplication />
    </AuthProvider>
  </StrictMode>,
);
