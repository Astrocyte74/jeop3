/**
 * Authentication utilities
 *
 * Provides utilities for integrating with Clerk authentication
 * Safe for local development without Clerk configured
 */

import React from 'react'

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
    // Clerk not configured - return safe defaults for local development
    return {
      isSignedIn: false,
      isLoaded: true,
      userId: null,
      sessionId: null,
      getToken: async () => null,
    }
  }

  // Clerk configured - use real hook (lazy import)
  const { useAuth: useClerkAuth } = require('@clerk/clerk-react')
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

  const { useUser: useClerkUser } = require('@clerk/clerk-react')
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

// Lazy load Clerk components and wrap them
let SignedIn_: React.ComponentType<any> | null = null
let SignedOut_: React.ComponentType<any> | null = null
let SignInButton_: React.ComponentType<any> | null = null
let SignOutButton_: React.ComponentType<any> | null = null
let UserButton_: React.ComponentType<any> | null = null

export const SignedIn = createClerkWrapper(function(props: any) {
  if (!SignedIn_) {
    const { SignedIn: ClerkSignedIn } = require('@clerk/clerk-react')
    SignedIn_ = ClerkSignedIn
  }
  return React.createElement(SignedIn_!, props)
})

export const SignedOut = createClerkWrapper(function(props: any) {
  if (!SignedOut_) {
    const { SignedOut: ClerkSignedOut } = require('@clerk/clerk-react')
    SignedOut_ = ClerkSignedOut
  }
  return React.createElement(SignedOut_!, props)
})

export const SignInButton = createClerkWrapper(function(props: any) {
  if (!SignInButton_) {
    const { SignInButton: ClerkSignInButton } = require('@clerk/clerk-react')
    SignInButton_ = ClerkSignInButton
  }
  return React.createElement(SignInButton_!, props)
})

export const SignOutButton = createClerkWrapper(function(props: any) {
  if (!SignOutButton_) {
    const { SignOutButton: ClerkSignOutButton } = require('@clerk/clerk-react')
    SignOutButton_ = ClerkSignOutButton
  }
  return React.createElement(SignOutButton_!, props)
})

export const UserButton = createClerkWrapper(function(props: any) {
  if (!UserButton_) {
    const { UserButton: ClerkUserButton } = require('@clerk/clerk-react')
    UserButton_ = ClerkUserButton
  }
  return React.createElement(UserButton_!, props)
})
