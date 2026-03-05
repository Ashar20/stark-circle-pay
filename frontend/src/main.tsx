import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import "./index.css";
import App from "./App.tsx";

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID ?? "";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: { theme: "light" },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>
);
