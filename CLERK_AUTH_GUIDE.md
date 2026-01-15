# Clerk Authentication Implementation Guide

This document describes how we implemented Clerk authentication for the jeop3 project, protecting AI game creation features while keeping gameplay public.

## Overview

**Goal:** Protect AI-powered game creation with Clerk JWT authentication while keeping game viewing/playing public.

**Architecture:**
- Frontend: Clerk React SDK for sign-in
- Backend: Custom JWT verification + Clerk Backend API
- Access Control: Approved email allowlist via environment variable

## Architecture Diagram

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Frontend      │         │   Clerk API      │         │   Backend       │
│  (jeop3)        │         │                  │         │ (YTV2-Dashboard)│
└────────┬────────┘         └──────────────────┘         └────────┬────────┘
         │                                                      │
         │ 1. User signs in with Clerk                         │
         │    → Gets JWT token                                 │
         │                                                      │
         │ 2. AI Request + Bearer token    ──────────────────>│
         │                                                      │
         │                                    3. Verify JWT    │
         │                                    4. Fetch email   │
         │                                    5. Check allowlist│
         │                                                      │
         │ 6. Response (AI data or 403)    <───────────────────│
         │                                                      │
```

## Implementation Steps

### 1. Clerk Setup

1. **Create Clerk Application**
   - Go to https://dashboard.clerk.com
   - Create new application
   - Enable Email sign-in (disable Google/GitHub if desired)
   - Copy Publishable Key and Secret Key

2. **Configure JWT Templates (Optional)**
   - Clerk's default JWT doesn't include email
   - You can customize JWT templates to include email
   - We chose to fetch email via API instead (more flexible)

### 2. Backend Implementation

#### Environment Variables

Add to your `.env` or Render environment variables:

```bash
# Clerk Authentication
CLERK_SECRET_KEY=sk_test_xxxxx  # From Clerk Dashboard
CLERK_APPROVED_EMAILS=user1@example.com,user2@example.com
```

#### Dependencies

Add to `requirements.txt` (or `requirements-dashboard.txt` for Docker):

```txt
pyjwt>=2.9.0
cryptography>=41.0.0
requests>=2.31.0
```

**Important:** PyJWT requires `cryptography` for RS256 signature verification!

#### JWT Verification Code

```python
import jwt
import requests
import base64
import os
from datetime import datetime

# Approved emails for game creation
CLERK_APPROVED_EMAILS = set(
    os.getenv('CLERK_APPROVED_EMAILS', '').split(',')
)

# Token cache (optional, for performance)
_TOKEN_CACHE = {}

def verify_clerk_bearer(auth_header: str) -> dict:
    """
    Verify a Clerk JWT token and return user info.

    Args:
        auth_header: The Authorization header value (e.g., "Bearer <token>")

    Returns:
        dict with user info including 'user_id' and 'email'

    Raises:
        PermissionError: If token is invalid or email not approved
    """
    # 1. Extract token
    if not auth_header or not auth_header.startswith('Bearer '):
        raise PermissionError('Missing bearer token')

    token = auth_header.split(' ', 1)[1].strip()

    # 2. Get unverified header to find kid (key ID)
    headers = jwt.get_unverified_header(token)
    kid = headers.get('kid')
    if not kid:
        raise PermissionError('Invalid token: missing kid')

    # 3. Get issuer from token
    unverified = jwt.decode(token, options={"verify_signature": False})
    iss = unverified.get('iss')
    if not iss:
        raise PermissionError('Invalid token: missing iss')

    # 4. Build JWKS URL
    jwks_url = f"{iss}/.well-known/jwks.json"

    # 5. Fetch public key from JWKS endpoint
    try:
        jwks_client = jwt.PyJWKClient(jwks_url)
        signing_key = jwks_client.get_signing_key(kid)
        pem_key = signing_key.key
    except (AttributeError, TypeError):
        # Fallback for older PyJWT versions
        response = requests.get(jwks_url, timeout=5)
        response.raise_for_status()
        jwks = response.json()

        # Find matching key
        jwk_key = None
        for key in jwks.get('keys', []):
            if key.get('kid') == kid:
                jwk_key = key
                break

        if not jwk_key:
            raise PermissionError('Invalid token: key not found')

        # Convert JWK to PEM
        def base64url_decode(data: str) -> bytes:
            padding = 4 - len(data) % 4
            if padding != 4:
                data += '=' * padding
            return base64.urlsafe_b64decode(data.encode())

        n = int.from_bytes(base64url_decode(jwk_key['n']), 'big')
        e = int.from_bytes(base64url_decode(jwk_key['e']), 'big')

        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives import serialization

        public_key = rsa.RSAPublicNumbers(e, n).public_key(default_backend())
        pem_key = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )

    # 6. Verify token signature
    decoded = jwt.decode(
        token,
        pem_key,
        algorithms=['RS256'],
        issuer=iss,
        options={'verify_aud': False}  # Clerk tokens don't always have aud
    )

    # 7. Extract user_id
    user_id = decoded.get('sub')
    if not user_id:
        raise PermissionError('Token missing sub claim')

    # 8. Fetch email from Clerk Backend API
    # Note: Clerk JWT doesn't include email by default
    clerk_secret_key = os.getenv('CLERK_SECRET_KEY')
    if not clerk_secret_key:
        raise PermissionError('Clerk not configured on server')

    # Check cache first (optional)
    cache_key = f"clerk_user_{user_id}"
    cached_user = _TOKEN_CACHE.get(cache_key)
    if cached_user and cached_user.get('exp', 0) > time.time():
        email = cached_user.get('email')
    else:
        # Fetch from Clerk API
        # IMPORTANT: Use api.clerk.com, NOT the accounts domain!
        clerk_api_url = f"https://api.clerk.com/v1/users/{user_id}"
        response = requests.get(
            clerk_api_url,
            headers={
                'Authorization': f'Bearer {clerk_secret_key}',
                'Content-Type': 'application/json'
            },
            timeout=10
        )
        response.raise_for_status()
        user_data = response.json()

        # Extract primary email
        email = None
        if user_data.get('email_addresses'):
            primary_id = user_data.get('primary_email_address_id')
            for addr in user_data['email_addresses']:
                if addr.get('id') == primary_id:
                    email = addr.get('email_address')
                    break
            if not email:
                email = user_data['email_addresses'][0].get('email_address')

        if not email:
            raise PermissionError(f'User {user_id} has no email address')

        # Cache for 1 hour
        _TOKEN_CACHE[cache_key] = {
            'email': email,
            'user_id': user_id,
            'exp': time.time() + 3600
        }

    # 9. Check if email is approved
    if email not in CLERK_APPROVED_EMAILS:
        raise PermissionError('Email not authorized for game creation')

    # 10. Return user info
    return {
        'user_id': user_id,
        'email': email,
        'iss': iss,
        'exp': float(decoded.get('exp', 0))
    }
```

#### Protected Endpoint Example

```python
def handle_protected_endpoint(self):
    """Handle POST /api/ai/generate - Protected endpoint"""
    try:
        # Verify Clerk JWT
        auth_header = self.headers.get('Authorization', '')
        try:
            user_info = verify_clerk_bearer(auth_header)
            logger.info(f"✅ Clerk auth verified for {user_info['email']}")
        except PermissionError as e:
            logger.warning(f"❌ Clerk auth failed: {e}")
            self.send_response(403)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        # Process the request...
        # Your existing code here

    except Exception as e:
        logger.error(f"Error: {e}")
        self.send_response(500)
        self.end_headers()
```

### 3. Frontend Implementation

#### Dependencies

```bash
npm install @clerk/clerk-react
```

#### Environment Variables

```bash
# .env file (VITE_ prefix for Vite)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
```

#### Auth Wrapper Module (`src/lib/auth/index.ts`)

**Why we need this:** Clerk's React hooks (`useAuth`, `useUser`, etc.) require the app to be wrapped in `ClerkProvider`. For local development without Clerk, we need safe wrappers that return defaults when Clerk isn't configured.

```tsx
// src/lib/auth/index.ts
import React from 'react'
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
    return {
      isSignedIn: false,
      isLoaded: true,
      userId: null,
      sessionId: null,
      getToken: async () => null,
    }
  }
  return useClerkAuth()
}

// Safe wrapper for useUser
export function useUser() {
  if (!isClerkConfigured()) {
    return { isLoaded: true, user: null }
  }
  return useClerkUser()
}

// Create wrapper components that only render Clerk components when configured
function createClerkWrapper(Component: React.ComponentType<any>) {
  return function ClerkWrapper(props: any) {
    if (!isClerkConfigured()) {
      return null  // Hide when Clerk not configured
    }
    return React.createElement(Component, props)
  }
}

// Export wrapped Clerk components
export const SignedIn = createClerkWrapper(ClerkSignedIn)
export const SignedOut = createClerkWrapper(ClerkSignedOut)
export const SignInButton = createClerkWrapper(ClerkSignInButton)
export const SignOutButton = createClerkWrapper(ClerkSignOutButton)
export const UserButton = createClerkWrapper(ClerkUserButton)
```

**Key points:**
- Always import from `@/lib/auth` instead of `@clerk/clerk-react`
- Use ES module imports (not `require()`) for Vite compatibility
- Placeholder keys like `pk_test_add_your_key_here` disable Clerk features
- Real keys enable full authentication

#### App Setup (with optional Clerk support)

```tsx
// main.tsx
import { ClerkProvider } from "@clerk/clerk-react"
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Check if Clerk is properly configured (not a placeholder key)
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
```

**Why this matters:** This allows local development with the Node.js AI server (no auth) while enabling full Clerk authentication when real keys are present. Use placeholder keys like `pk_test_add_your_key_here` for local dev to disable auth features.

#### Sign-In/Sign-Out Button

```tsx
// MainMenu.tsx
// IMPORTANT: Import from @/lib/auth wrapper, NOT @clerk/clerk-react directly
// This ensures the app works without Clerk configured (local dev mode)
import { useAuth, useUser, SignInButton, SignedIn, SignedOut } from '@/lib/auth';
import { LogOut } from 'lucide-react';

export function MainMenu() {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();

  return (
    <div>
      {/* Header with auth button */}
      <header>
        <SignedIn>
          <button onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </button>
          <span>{user?.firstName}</span>
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <button>Sign In</button>
          </SignInButton>
        </SignedOut>
      </header>

      {/* Protected features */}
      <SignedIn>
        <button>Create Game (AI)</button>
      </SignedIn>
      <SignedOut>
        <button onClick={() => alert('Please sign in to create games')}>
          Create Game (AI) 🔒
        </button>
      </SignedOut>
    </div>
  );
}
```

#### Calling Protected APIs

```tsx
// hooks.ts
// IMPORTANT: Import from @/lib/auth wrapper
import { useAuth } from '@/lib/auth';

export function useAIGeneration() {
  const { getToken } = useAuth();

  const generate = async (promptType: string, context: any) => {
    // Get auth token
    const authToken = await getToken().catch(() => null);

    if (!authToken) {
      throw new Error('Please sign in to use AI features');
    }

    // Call API with Bearer token
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`  // Important: "Bearer " prefix
      },
      body: JSON.stringify({ promptType, context })
    });

    if (!response.ok) {
      throw new Error('AI generation failed');
    }

    return response.json();
  };

  return { generate };
}
```

### 4. Conditional UI Based on Auth

```tsx
// GameBoard.tsx
// IMPORTANT: Import from @/lib/auth wrapper
import { useAuth } from '@/lib/auth';

export function GameBoard() {
  const { isSignedIn } = useAuth();

  return (
    <div>
      {/* AI Model selector - only for signed in users */}
      {isSignedIn && (
        <DropdownMenu>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>AI Model</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {/* Model options... */}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenu>
      )}

      {/* Board Editor - only for signed in users */}
      {isSignedIn && (
        <MenuItem onClick={onToggleEditor}>
          Board Editor
        </MenuItem>
      )}
    </div>
  );
}
```

## Troubleshooting Guide

### Issue 1: "RS256 requires 'cryptography' to be installed"

**Error:**
```
Clerk auth error: RS256 requires 'cryptography' to be installed.
```

**Solution:**
Add `cryptography>=41.0.0` to your requirements.txt. PyJWT needs this for RSA signature verification.

### Issue 2: "Algorithm not supported"

**Error:**
```
Clerk auth error: Invalid token: Algorithm not supported
```

**Solution:**
Make sure you're converting JWK to PEM format correctly. PyJWT's RS256 requires a PEM-formatted RSA public key, not a JWK dict.

### Issue 3: "Token missing email claim"

**Error:**
```
Token missing email claim. Available claims: ['azp', 'exp', 'fva', 'iat', 'iss', 'nbf', 'sid', 'sts', 'sub', 'v']
```

**Solution:**
Clerk's default JWT doesn't include email. Fetch it from Clerk Backend API:
```python
clerk_api_url = f"https://api.clerk.com/v1/users/{user_id}"
```

### Issue 4: 404 from Clerk API

**Error:**
```
Failed to fetch user from Clerk API: 404 Client Error: Not Found for url: https://big-stud-70.clerk.accounts.dev/v1/users/...
```

**Solution:**
Use `api.clerk.com` for Backend API, NOT the accounts domain from the issuer:
```python
# WRONG
clerk_api_url = f"{iss}/v1/users/{user_id}"  # Uses accounts domain

# RIGHT
clerk_api_url = f"https://api.clerk.com/v1/users/{user_id}"
```

### Issue 5: PyJWKClient import error

**Error:**
```
cannot import name 'PyJWKClient' from 'jwt.algorithms'
```

**Solution:**
Add fallback for older PyJWT versions or ensure you're using PyJWT >= 2.0.

### Issue 6: "require is not defined" (Vite/ES modules)

**Error:**
```
Uncaught ReferenceError: require is not defined
    at useAuth (index.ts:35:37)
```

**Solution:**
Use ES module imports instead of `require()`. In Vite projects, `require()` is not available. Use static imports at the top of the file:

```tsx
// WRONG - won't work in Vite
const { useAuth: useClerkAuth } = require('@clerk/clerk-react')

// CORRECT - use ES module imports
import { useAuth as useClerkAuth } from '@clerk/clerk-react'
```

The auth wrapper module in `src/lib/auth/index.ts` handles this correctly by using ES module imports and runtime checks for whether Clerk is configured.

## Security Considerations

1. **Always verify JWT signature** - Never trust unverified tokens
2. **Check email against allowlist** - Don't skip the approval check
3. **Use HTTPS** - Never send tokens over HTTP
4. **Cache carefully** - Cache user email but not the token itself
5. **Log auth attempts** - Track both successes and failures
6. **Token expiration** - JWTs expire, handle gracefully

## Production Checklist

- [ ] Update Clerk to production keys (not test keys)
- [ ] Set appropriate CORS origins in Clerk Dashboard
- [ ] Configure JWT template (optional, if including email in token)
- [ ] Add production emails to `CLERK_APPROVED_EMAILS`
- [ ] Test sign-in/sign-out flow
- [ ] Test protected endpoints with valid token
- [ ] Test protected endpoints with invalid token
- [ ] Test protected endpoints without token
- [ ] Monitor Clerk API usage (rate limits apply)

## Alternative: Clerk Backend SDK

For more complex applications, consider using Clerk's official Python SDK:

```bash
pip install clerk-backend-python
```

This provides more features but requires additional setup. Our custom implementation is lightweight and sufficient for simple JWT verification.

## Resources

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Backend API](https://clerk.com/docs/backend-requests/resources/user)
- [PyJWT Documentation](https://pyjwt.readthedocs.io/)
- [JWT.io](https://jwt.io/) - Debug JWT tokens

## Summary

The key insights from this implementation:

1. **Clerk JWT structure** - Default token doesn't include email, requires API call
2. **PyJWT requirements** - Needs `cryptography` library for RS256
3. **API domains** - Backend API is `api.clerk.com`, not accounts domain
4. **JWK to PEM** - PyJWT needs PEM format, requires conversion
5. **Token caching** - Cache user info, not tokens themselves
6. **Auth wrapper pattern** - Use wrapper module (`@/lib/auth`) for optional Clerk support
7. **ES modules** - Vite requires ES imports, not `require()` calls
8. **Placeholder key detection** - Check for "add_your_key_here" to disable features locally

This approach provides secure authentication with minimal dependencies while keeping public access for gameplay and supporting both local development (without auth) and production (with auth).

## Local Icon Setup

Local development uses symlink from `/public/icons` to `/Users/markdarby/projects/icons`
for faster loading. Production uses Cloudflare R2 via `VITE_ICON_BASE_URL`.
