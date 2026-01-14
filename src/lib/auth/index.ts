/**
 * Authentication utilities
 *
 * Provides utilities for integrating with Clerk authentication
 */

import { useAuth } from '@clerk/clerk-react';

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
