# Kinesis: web readiness and security hardening report

Scope:
- The Expo POS app (`src/`), the FastAPI backend (`backend/`) and the LAN
  deployment (`deploy/`).
- The admin console (`admin/`) only where it shares the backend or origin.

Prepared for the upcoming penetration test, November 2026.

## Summary

- **The POS app now runs in browsers**, including iPhone Safari and the
  home-screen web app. The native code paths are unchanged:
  - Platform-specific code sits behind one interface each: credentials,
    device cache, receipt export and the QR scanner.
  - No calling code branches on the platform.
- **No secrets reach browser JavaScript.**
  - Browser terminals and cashiers use `__Host-` cookies that are
    `HttpOnly; Secure; SameSite=Strict`, set by the server.
  - Only a CSRF token is kept, and only in memory.
  - Nothing sensitive is written to `localStorage`, `sessionStorage` or
    IndexedDB.
- **All traffic can be HTTPS/WSS on an offline LAN.**
  - A locally managed, name-constrained CA issues the certificates.
  - Release builds refuse plain HTTP.
- **Server-side session controls were added:**
  - terminal credential rotation, with detection of a reused old credential;
  - expiry after inactivity;
  - revocation that really revokes;
  - cashier session rotation when the PIN is re-entered;
  - a cashier is required for catalog and inventory changes.

## Findings

Severity is for the code as it was before these changes. "Fixed" means
fixed and covered by an automated test or the end-to-end run described
under Verification.

| # | Severity | Finding (where) | Change | Status |
|---|---|---|---|---|
| 1 | Critical (web) | `expo-secure-store` has no web implementation (its web module is empty), so every credential read or write threw and the web app could not start (`src/lib/api.ts`, `CashierAuthContext.tsx`, `useTerminalAgent.ts`, `TerminalSettingsContext.tsx`) | One `CredentialStore` interface (`src/lib/auth/credentialTypes.ts`): `credentials.native.ts` uses Keychain/Keystore, `credentials.web.ts` uses HttpOnly cookies | Fixed |
| 2 | High | API reached over plain `http://` on the LAN, so bearer tokens, PINs and sales data crossed Wi-Fi in cleartext. An https web origin also can't call an http API | Local CA and Caddy TLS (`deploy/`). `src/lib/config.ts` makes release builds refuse a non-HTTPS API and WebSocket. Android release builds block cleartext (`plugins/withKinesisNetworkSecurity.js`) | Fixed in code; HTTPS must be deployed |
| 3 | High | Terminal tokens never expired or rotated. "Disconnect" only set `is_enabled=false`, and "enable" revived the same token (`terminal_routes.py`) | `auth/pos_auth.py`: 7-day rotation; the old token is accepted for 120 s, and later use revokes and disables the terminal; expiry after 30 days unseen; disconnect deletes all credential hashes and cashier sessions and closes live WebSockets; a revoked device must re-pair with a new QR code. Migration `a7c3e91f4b20` | Fixed |
| 4 | High | A terminal credential alone could create, edit and delete products, services and stock, with no person attributed (`main.py`, `services_routes.py`, `inventory_routes.py`) | New `require_writable_cashier` dependency; activity events record the cashier (`activity_tracking._record`) | Fixed |
| 5 | High | No security headers (CSP, HSTS, frame protection); CORS sent `allow_headers=["*"]` with credentials (`main.py`) | Full browser policy in `deploy/caddy/Caddyfile`; baseline headers on every API response; explicit CORS header list built from configured origins only | Fixed |
| 6 | High (web) | Cookies are shared between ports of the same host, so code on the POS origin could call admin endpoints with an admin's cookie, and a stale admin cookie shadowed a valid terminal credential (`auth/dependencies.py`) | Caddy exposes only POS API prefixes on the POS origin (admin, auth and console return 404). A terminal credential now takes precedence in mixed routes | Fixed |
| 7 | Medium | Device ID and transaction code (the checkout idempotency key) used `Math.random()` (`useTerminalAgent.ts`, `checkout.tsx`) | `src/lib/secureRandom.ts` (expo-crypto CSPRNG, unbiased encoding) | Fixed |
| 8 | Medium | iOS Keychain items used the default `WHEN_UNLOCKED`, so they migrate through backups. Android had `allowBackup="true"`, and the local `android/` folder lacks secure-store backup rules | `WHEN_UNLOCKED_THIS_DEVICE_ONLY` for new writes; `android.allowBackup: false`; regenerate with `npx expo prebuild --clean` | Fixed (see Residual risk 4) |
| 9 | Medium | Cashier session not rotated when the PIN is re-entered | `verify-pin` issues a new session and revokes the old one; the client stores the new token | Fixed |
| 10 | Medium | Login lockout keyed on the direct peer IP: behind a proxy, every client would share one bucket | uvicorn `--proxy-headers --forwarded-allow-ips 127.0.0.1`; Caddy overwrites `X-Forwarded-For` (spoofing tested) | Fixed (deployment flags) |
| 11 | Medium (web) | Receipt export used `Print.printToFileAsync` and `Sharing.shareAsync`; on web that prints the whole app and returns no file | `src/lib/receiptExport.web.ts` prints the already-escaped receipt HTML from a sandboxed (`allow-same-origin allow-modals`, no scripts) `srcdoc` iframe | Fixed |
| 12 | Medium (web) | QR scanning uses `BarcodeDetector`, which Safari/iPhone and Firefox lack; camera access needs HTTPS | `src/components/PairingScanner.web.tsx`: BarcodeDetector or jsQR, plus a paste field; the admin console can show the code as text | Fixed |
| 13 | Medium | Raw tokens were held in React state and passed through props | Only a `paired` boolean is passed; credentials stay in the keystore or cookie | Fixed |
| 14 | Low | `getImageUri` accepted any absolute URL from the server (`src/lib/products.ts`) | Only same-origin API paths are accepted | Fixed |
| 15 | Low | Backend portability: working-directory-relative `.env`/uploads, `os.fchmod`, Linux-only backup path, `pg_dump` lookup, Windows decoding | `backend/config_paths.py` and related fixes; see `docs/deployment/ARCHITECTURE.md` | Fixed |
| 16 | Low | Non-secret settings cached in SecureStore (Android warns above 2 KB) | `src/lib/deviceCache.*`: native unchanged, web uses `localStorage` (non-secret by design) | Fixed |
| 17 | Info | Bundle secrets: only `EXPO_PUBLIC_API_URL` is public; `app.json` has no secrets; `.env` files are git-ignored. Production web builds ignore `EXPO_PUBLIC_API_URL` and use their own origin | `deploy/tools/check_web_build.py` checks for secrets and CSP hashes | Verified |
| 18 | Info | No `dangerouslySetInnerHTML`, `eval` or `new Function` in `src/` or `admin/src/`; Expo's `ScrollViewStyleReset` injects a constant style string. Deep links: only the `receipt?transactionCode` parameter, which is URL-encoded before use. `external-link.tsx` only receives hrefs written in code | none | Verified |

### Pre-existing issues found but not changed

| Severity | Issue | Recommendation |
|---|---|---|
| Medium (native) | Product images (`GET /api/products/{id}/image`) require terminal authentication, but native `<Image source={{ uri }}>` sends no `Authorization` header, so images likely fail on iOS/Android. Web works because the cookie is sent | Add an authenticated image source on native (`source={{ uri, headers }}` from the credential store), or serve images with short-lived signed URLs |
| Low | `src/app/context/*` and `src/app/declarations.d.ts` are inside the router directory, so the web build exports them as pages (`/context/CashierAuthContext`) | Move them to `src/context/` and `src/types/` |
| Low | Admin console: `tsc` reports unused imports in `admin/src/views/Terminals.tsx` (`Activity`, `Gauge`, `totalCount`) | Remove them |
| Low | `backend/.env` still contains `KINESIS_TERMINAL_ENROLLMENT_KEY`, which no code reads | Delete it |

## Design decisions

### Token storage and authentication
- **Browsers use HttpOnly cookies.** This was approved for this pass.
  - The alternatives were tokens held in memory plus a refresh cookie, or a
    WebCrypto key in IndexedDB.
  - Both still let an XSS payload *use* the credential. The IndexedDB key
    also adds client-side crypto for no gain.
  - HttpOnly cookies keep the credential out of reach of scripts entirely.
    The remaining XSS risk is requests made from the page while it is open,
    which the CSP reduces.
- **Opaque server-side sessions, not JWT access/refresh pairs.**
  - Every request is checked against PostgreSQL (SHA-256 of a 256-bit
    random token), so logout, disconnect and cashier deactivation take
    effect immediately.
  - "Short-lived access tokens with refresh rotation" is covered by
    cashier sessions (idle and absolute expiry, rotation on
    re-authentication) and by terminal credential rotation with reuse
    detection.
  - JWTs would add signing keys and a revocation gap for no benefit on a
    single server.
- **CSRF protection for cookies:**
  - `SameSite=Strict`;
  - an exact `Origin` allow-list (`KINESIS_POS_ALLOWED_ORIGINS`);
  - an `X-CSRF-Token` that is an HMAC-SHA256 of the terminal and its pairing
    time under the server secret;
  - on the WebSocket handshake, an Origin check whenever the cookie is
    present.
- **Native apps keep header tokens in Keychain/Keystore.** Headers can't be
  attached by another site, so CSRF doesn't apply to them.

### Cryptography
- Server tokens use `secrets.token_urlsafe(32)`; PINs and passwords use
  Argon2id (existing).
- CSRF uses HMAC-SHA256 with `KINESIS_ADMIN_AUTH_SECRET_KEY`. In production
  the app refuses to start without a secret of at least 32 characters.
- On the client, expo-crypto's CSPRNG provides identifiers. There is no
  custom crypto and no hardcoded keys, IVs or salts.
- The PKI uses ECDSA P-256 and SHA-256 with random serials. The root key is
  exported encrypted (PKCS#8, `BestAvailableEncryption`) and is not kept on
  the host.

### Remaining development fallback
The backend keeps its existing development-only HMAC key when
`KINESIS_ENVIRONMENT=development`. Production startup refuses it. Make sure
the production env file sets `KINESIS_ENVIRONMENT=production` (it does in
the template).

## Residual risks and to-dos

1. **Deploy HTTPS.** None of the transport protections apply until the
   shop runs Caddy with the local CA and native apps are built with an
   `https://` `EXPO_PUBLIC_API_URL`. Release builds pointed at `http://`
   now refuse to connect, on purpose.
2. **Name-constraint enforcement on devices isn't documented by Apple or
   Google.** OpenSSL enforces it (tested). Run the
   `issue-constraint-test` check in `deploy/README-tls.md` on each target
   iOS/Android version.
3. **XSS still allows actions within the page.** The CSP blocks inline and
   foreign scripts (one hashed inline script). `style-src 'unsafe-inline'`
   is required by React Native Web.
4. **Existing native installs.** Keychain items written before this change
   keep `WHEN_UNLOCKED` until next written (cashier: next login; terminal:
   next rotation, within 7 days). Rebuild Android with `prebuild --clean`
   to apply `allowBackup=false`.
5. **The issuing CA key is on the host.** This is needed for unattended
   renewal. The proxy account owns it; the backend account cannot read it.
   Name constraints limit misuse.
6. **Plain-HTTP onboarding page.** It only serves public CA material. Users
   must compare the fingerprint; a LAN attacker could otherwise substitute
   a CA during onboarding.
7. **6-digit cashier PINs.** The existing lockout (5 attempts per 15 min per
   account and per IP) caps guessing at about 480 attempts per day per
   account. Consider longer PINs, or a supervisor alert after a lockout.
8. **WebSocket and `connect-src 'self'`.** Check on the oldest supported
   iOS that `'self'` matches `wss://`. If not, add the `wss://` origins to
   the CSP.
9. **Automatic database backups and an offline Python lockfile** are
   recommended next steps (see the architecture doc).

## OWASP mapping

### MASVS (mobile)

| Control | How it is met |
|---|---|
| MASVS-STORAGE-1 (sensitive data stored securely) | Tokens only in Keychain/Keystore (`credentials.native.ts`), `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Web: HttpOnly cookies only |
| MASVS-STORAGE-2 (no leakage) | Android backup disabled; no tokens in logs, React state or web storage |
| MASVS-CRYPTO-1/2 (strong, standard crypto; proper key management) | expo-crypto CSPRNG; server-side `secrets` and Argon2id; no custom crypto or hardcoded keys |
| MASVS-AUTH-1/2 (secure auth and session management) | Server-side sessions with idle/absolute expiry, rotation, revocation on logout and disconnect, reuse detection |
| MASVS-NETWORK-1 (secure traffic) | Release builds require HTTPS/WSS; Android cleartext blocked; TLS 1.2+ |
| MASVS-NETWORK-2 (identity pinning where needed) | User CAs trusted only for Kinesis host names on Android. Future: carry the root fingerprint in a v2 pairing QR for pinning |
| MASVS-PLATFORM-1 (IPC / deep links) | Only `receipt?transactionCode`, URL-encoded; no custom URL handlers that perform actions |
| MASVS-PLATFORM-3 (UI / WebView) | Receipt rendering uses escaped HTML in a script-less sandboxed iframe (web) or expo-print (native) |
| MASVS-CODE-4 (input validation) | Pydantic validation on the server; pairing payload checked against a strict pattern |

### ASVS 4.0 (web)

| Requirement area | How it is met |
|---|---|
| V3.2 session binding / new session on authentication | New token on pairing, cashier login and PIN re-verify |
| V3.3 session logout and timeout | Server-side revocation; idle/absolute limits (cashier); idle expiry (terminal) |
| V3.4 cookie-based sessions | `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` |
| V3.5 token-based sessions | Opaque random tokens, server-side storage of SHA-256 digests only |
| V4.1/4.2 access control and CSRF | Cashier required for writes; terminal-scoped cashier sessions; Origin and CSRF token on unsafe cookie requests; admin API unreachable from the POS origin |
| V8.2 client-side data protection | No sensitive data in browser storage; `Cache-Control: no-store` on all API responses; no service worker |
| V9.1/9.2 communications | TLS 1.2/1.3 only, HSTS, `wss://`; backend listens on loopback only |
| V14.2 dependencies | Two new client dependencies (`expo-crypto`, `jsqr`) |
| V14.4 HTTP security headers | CSP (hash-based script policy), HSTS, `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP |
| V14.3 / V10 secrets in client | Bundle scanner (`deploy/tools/check_web_build.py`) |

## Verification performed

- **Backend (`backend/tests/`, 26 tests, throwaway PostgreSQL):**
  - native and browser pairing;
  - Origin, CSRF and mixed-credential rejection;
  - rotation, grace period and reuse revocation;
  - idle expiry;
  - disconnect revokes, and re-pairing restores;
  - cashier required for writes, with attribution;
  - verify-pin rotation;
  - browser cashier cookie and server-side logout;
  - WebSocket cookie Origin check and native message authentication;
  - portable path helpers.
- **Migration:** upgrade, downgrade and upgrade again.
- **End to end through Caddy over TLS, with production config validation:**
  - the cookie flags as issued;
  - CSRF enforcement;
  - admin API 404 on the POS origin;
  - real client IP recorded despite a spoofed header;
  - WSS cookie authentication with Origin rejection;
  - graceful uvicorn shutdown.
- **Caddy:**
  - header set, TLS 1.1 refused, HTTP→HTTPS redirect;
  - the onboarding page serves only CA files (path traversal gets 404);
  - certificate renewal is picked up by a live reload.
- **PKI:**
  - `openssl verify` succeeds for both the host name and the IP;
  - the constraint-test certificate is rejected ("permitted subtree
    violation");
  - safety guards work (public IP, root key inside the PKI directory,
    re-initialization, wrong passphrase).
- **App:**
  - `tsc` clean;
  - production web export;
  - bundle scan clean;
  - Android prebuild output (network policy, `allowBackup=false`,
    secure-store backup rules).

## How to verify on devices

### Web (iPhone Safari and home-screen app, Android Chrome, desktop)
1. Onboard the CA (`deploy/README-tls.md`) and open `https://kinesis.local`.
2. **iPhone:** add Kinesis to the Home Screen and open it. Pair inside the
   home-screen app: the camera works through jsQR, and the paste field
   works too.
3. Sign in as a cashier, sell, open the receipt, and use **Export Receipt**.
   The print dialog's "Save as PDF" should show only the receipt.
4. Change a setting in the admin console. The terminal should update within
   seconds (settings push over `wss`).
5. Check in Safari Web Inspector or Chrome DevTools:
   - **Application/Storage:** no tokens in Local Storage, Session Storage
     or IndexedDB. Only the non-secret `kinesis-terminal-device-id`,
     `kinesis-terminal-paired` and `kinesis-terminal-pos-settings` keys.
   - **Cookies:** `__Host-kinesis_terminal` and `__Host-kinesis_cashier`
     are HttpOnly, Secure and SameSite=Strict.
   - **Network:** the response headers include the CSP and HSTS; the
     console shows no CSP violations.
6. From another origin (for example a page on `https://kinesis.local:8443`),
   a `fetch` POST to `https://kinesis.local/api/terminals/heartbeat` with
   `credentials: "include"` should get **403**.
7. In the admin console, use **Disable/Revoke** on the terminal. The browser
   should return to the pairing screen at the next heartbeat.

### iOS (native)
1. `EXPO_PUBLIC_API_URL=https://kinesis.local npx expo run:ios --configuration Release`
2. Before the CA is trusted, the app can't connect. After trusting it, the
   app connects.
3. Accept the Local Network prompt, pair by camera, sell, and export a PDF
   through the share sheet.
4. Upgrade over an existing install. The terminal should stay paired: the
   keystore keys are unchanged.

### Android (native)
1. `EXPO_PUBLIC_API_URL=https://kinesis.local KINESIS_TLS_HOSTS=<LAN-IP> npx expo prebuild --clean`,
   then `npx expo run:android --variant release`.
2. The merged manifest has `allowBackup="false"` and
   `networkSecurityConfig`.
3. Pair, sell, and export a PDF.
4. With `EXPO_PUBLIC_API_URL=http://…` the release build should refuse to
   connect.
5. Install a mitmproxy CA as a user CA. Traffic to other hosts should not be
   interceptable. Kinesis hosts trust user CAs by design, so verify the
   Kinesis root fingerprint when onboarding.
