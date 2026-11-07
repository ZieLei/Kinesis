import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * HTML shell for the web build (static rendering only; never runs in the
 * browser or on native).
 *
 * Adds what iPhone Safari needs to install Kinesis on the Home Screen as a
 * standalone app. There is deliberately no service worker: authenticated
 * API responses must never be cached on the device.
 *
 * Security headers (CSP, HSTS, frame-ancestors, ...) are set by the
 * reverse proxy, not via <meta>, so they also cover non-HTML responses.
 * No inline scripts are added here, so the CSP can keep script-src 'self'.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#1e1e2e" />
        <meta name="referrer" content="no-referrer" />

        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Kinesis" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />

        {/* Expo's constant style reset for full-screen React Native web. */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
