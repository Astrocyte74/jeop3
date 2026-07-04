/**
 * Authentication utilities
 *
 * Provides utilities for integrating with Clerk authentication
 * Safe for local development without Clerk configured
 */

import React from 'react'

// Import Clerk hooks - these will only work when wrapped in ClerkProvider
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-react'
import { SignedIn as ClerkSignedIn, SignedOut as ClerkSignedOut, SignInButton as ClerkSignInButton, SignOutButton as ClerkSignOutButton, UserButton as ClerkUserButton } from '@clerk/clerk-react'

// Check if Clerk is properly configured (not a placeholder key)
function isClerkConfigured(): boolean {
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    return false
  }
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  return !!key &&
    !key.includes('add_your_key_here') &&
    !key.includes('YOUR_KEY')
}

/**
 * Dev/testing bypass for the Clerk sign-in gate.
 *
 * The sign-in requirement exists so multiple users can each keep their own
 * games (ownership / visibility). For local single-user play and automated
 * testing it's just friction. Set `localStorage['jeop3:devAuthBypass'] = 'true'`
 * on localhost to skip it — useAuth()/useUser() then report a signed-in "Dev"
 * user, opening every AI gate. Never active outside localhost.
 */
const DEV_BYPASS_KEY = 'jeop3:devAuthBypass'

function isLocalDev(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

export function isDevAuthBypass(): boolean {
  if (!isLocalDev()) return false
  try {
    return window.localStorage.getItem(DEV_BYPASS_KEY) === 'true'
  } catch {
    return false
  }
}

export function enableDevAuthBypass(): void {
  if (!isLocalDev()) return
  try {
    window.localStorage.setItem(DEV_BYPASS_KEY, 'true')
  } catch {}
}

export function disableDevAuthBypass(): void {
  try {
    window.localStorage.removeItem(DEV_BYPASS_KEY)
  } catch {}
}

// Safe wrapper for useAuth - returns defaults when Clerk not configured
export function useAuth() {
  if (isDevAuthBypass()) {
    return {
      isSignedIn: true,
      isLoaded: true,
      userId: 'dev-bypass',
      sessionId: 'dev',
      getToken: async () => 'dev-bypass-token',
      signOut: async () => {
        disableDevAuthBypass()
        if (typeof window !== 'undefined') window.location.reload()
      },
    }
  }

  if (!isClerkConfigured()) {
    // Clerk not configured - return safe defaults for local development
    return {
      isSignedIn: false,
      isLoaded: true,
      userId: null,
      sessionId: null,
      getToken: async () => null,
      signOut: async () => {}, // no-op for local dev
    }
  }

  // Clerk configured - use real hook
  return useClerkAuth()
}

// Safe wrapper for useUser - returns defaults when Clerk not configured
export function useUser() {
  if (isDevAuthBypass()) {
    const devEmail = 'dev@localhost'
    return {
      isLoaded: true,
      user: {
        id: 'dev-bypass',
        firstName: 'Dev',
        fullName: 'Dev Tester',
        emailAddresses: [{ emailAddress: devEmail }],
        primaryEmailAddress: { emailAddress: devEmail },
      } as any,
    }
  }

  if (!isClerkConfigured()) {
    return {
      isLoaded: true,
      user: null,
    }
  }

  return useClerkUser()
}

/**
 * Get authorization header for API requests
 * Returns the Bearer token if user is authenticated, null otherwise
 */
export function useAuthHeader(): { getAuthorizationHeader: () => Promise<string | null> } {
  const { getToken } = useAuth();

  return {
    getAuthorizationHeader: async () => {
      try {
        const token = await getToken();
        return token ? `Bearer ${token}` : null;
      } catch {
        return null;
      }
    }
  };
}

/**
 * Check if user is authenticated
 */
export function useIsAuthenticated(): { isAuthenticated: boolean } {
  const { isSignedIn, isLoaded } = useAuth();

  return {
    isAuthenticated: isLoaded === true ? isSignedIn === true : false
  };
}

// Create wrapper components that only render Clerk components when configured
function createClerkWrapper(Component: React.ComponentType<any>) {
  return function ClerkWrapper(props: any) {
    if (!isClerkConfigured()) {
      // Clerk not configured - render nothing (content hidden)
      return null
    }
    // Clerk configured - render the actual component
    return React.createElement(Component, props)
  }
}

// Export wrapped Clerk components
export const SignedIn = createClerkWrapper(ClerkSignedIn)
export const SignedOut = createClerkWrapper(ClerkSignedOut)
export const SignInButton = createClerkWrapper(ClerkSignInButton)
export const SignOutButton = createClerkWrapper(ClerkSignOutButton)
export const UserButton = createClerkWrapper(ClerkUserButton)
