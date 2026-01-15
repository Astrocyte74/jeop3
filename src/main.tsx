import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ClerkProvider } from "@clerk/clerk-react"

import "./index.css"
import App from "./App.tsx"

// Get Clerk publishable key from environment
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Check if Clerk is properly configured (not a placeholder)
const isClerkConfigured = PUBLISHABLE_KEY &&
  !PUBLISHABLE_KEY.includes("add_your_key_here") &&
  !PUBLISHABLE_KEY.includes("YOUR_KEY")

function Root() {
  // If Clerk is configured, wrap app in ClerkProvider
  // Otherwise, run app without Clerk (for local development)
  if (isClerkConfigured) {
    return (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    )
  }

  // No Clerk - run app directly (local Node.js server mode)
  return <App />
}

// Handle Clerk initialization errors gracefully
try {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>
  )
} catch (error) {
  console.error("Failed to initialize app:", error)
  // Fallback: render without Clerk
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
