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

// Safe wrapper for useAuth - returns defaults when Clerk not configured
export function useAuth() {
  if (!isClerkConfigured()) {
    // Clerk not configured - local trusted mode (for Docker/Tailscale/development)
    return {
      isSignedIn: true, // Local trusted mode - treat as authenticated
      isLoaded: true,
      userId: 'local-user',
      sessionId: 'local-session',
      getToken: async () => null, // No token needed for local mode
      signOut: async () => {}, // no-op for local dev
    }
  }

  // Clerk configured - use real hook
  return useClerkAuth()
}

// Safe wrapper for useUser - returns defaults when Clerk not configured
export function useUser() {
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

// Create wrapper components that handle both Clerk and non-Clerk environments
function createClerkWrapper(Component: React.ComponentType<any>, options: { renderWhenUnconfigured: 'children' | 'null' }) {
  return function ClerkWrapper(props: any) {
    if (!isClerkConfigured()) {
      // Clerk not configured - local trusted mode behavior
      if (options.renderWhenUnconfigured === 'children') {
        // Render children directly (for SignedIn - authenticated content should show)
        return React.createElement(React.Fragment, {}, props.children)
      } else {
        // Render nothing (for SignedOut - don't show sign-in prompts in local mode)
        return null
      }
    }
    // Clerk configured - render the actual component
    return React.createElement(Component, props)
  }
}

// Export wrapped Clerk components
// SignedIn: render children in local mode (authenticated content should be accessible)
export const SignedIn = createClerkWrapper(ClerkSignedIn, { renderWhenUnconfigured: 'children' })
// SignedOut: render nothing in local mode (don't show sign-in prompts)
export const SignedOut = createClerkWrapper(ClerkSignedOut, { renderWhenUnconfigured: 'null' })
export const SignInButton = createClerkWrapper(ClerkSignInButton, { renderWhenUnconfigured: 'null' })
export const SignOutButton = createClerkWrapper(ClerkSignOutButton, { renderWhenUnconfigured: 'children' })
export const UserButton = createClerkWrapper(ClerkUserButton, { renderWhenUnconfigured: 'children' })
