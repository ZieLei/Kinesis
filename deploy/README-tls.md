# Kinesis HTTPS on an offline shop network

Kinesis encrypts all traffic between devices and the shop's server (HTTPS
and secure WebSockets), with no internet connection, cloud service or paid
certificate. The server creates its own small certificate authority (CA).
Each device trusts that CA **once**.

- Certificates are managed by `deploy/pki/kinesis_pki.py`. It is separate
  from the POS backend, which never sees a private key.
- Caddy (`deploy/caddy/Caddyfile`) serves HTTPS with those certificates.
- The CA is **name-constrained**: it can only vouch for the Kinesis server's
  names and private (LAN) addresses. A device that trusts it can't be
  attacked with certificates for banks, email or any other website, even
  if a Kinesis CA key were stolen. OpenSSL enforces this; check your device
  types with the test in [Verify name constraints](#verify-name-constraints).

## 1. Host setup (once)

The commands below use the Linux layout and the template's default ports
as examples. For the shop's host, use the paths in
`docs/deployment/MIGRATION.md` (section 3) and the shop's ports: POS 9443,
admin 9444, onboarding `http://<LAN-IP>:9080`.

Requirements: Python 3.11+ with
`pip install --require-hashes --only-binary :all: -r deploy/pki/requirements.lock`.
The Linux and macOS installers put it in a separate `pki-venv`
(`<CODE>/pki-venv/bin/python`), never in the backend's venv; use that
interpreter for the commands below. An existing PKI folder can be handed to
the installers with `--pki-dir`. The Arch user-scope install uses it in
place, as `~/.local/share/kinesis-host/pki`.

1. **Give the server a fixed LAN address.** Reserve it in the router's DHCP
   settings (for example `192.168.1.10`).
2. **Insert a USB stick** (or other offline storage) for the root key.
3. Create the CA. Paths are shown for Linux; see
   `docs/deployment/ARCHITECTURE.md` for macOS and Windows:

   ```sh
   python deploy/pki/kinesis_pki.py --pki-dir /var/lib/kinesis/pki init \
     --ip 192.168.1.10 \
     --root-key-out /media/usb/kinesis-root-ca.key.enc \
     --reload-command "caddy reload --config /opt/kinesis/deploy/caddy/Caddyfile --adapter caddyfile --force" \
     --reload-env-file /etc/kinesis/caddy.env
   ```

   - The host names default to `kinesis.local` plus `<computer-name>.local`.
     Add `--hostname` to change them.
   - Choose a passphrase of 12 or more characters. **Store the USB stick and
     the passphrase separately, offline.** They're only needed every few
     years, to replace the issuing CA, or after a compromise.
   - Write down the **SHA-256 fingerprint** printed at the end.
4. Write the onboarding files that Caddy serves on `http://<LAN-IP>:8080`:

   ```sh
   python deploy/pki/kinesis_pki.py --pki-dir /var/lib/kinesis/pki export-ca --out /var/lib/kinesis/onboarding
   ```

5. Check the result at any time (read-only; also run it on a new host after
   copying the PKI directory):

   ```sh
   python deploy/pki/kinesis_pki.py --pki-dir /var/lib/kinesis/pki verify --expect-ip 192.168.1.10
   ```

   It checks every signature in the chain, that each key matches its
   certificate, the validity periods, and the certificate names.
6. Renewal is automatic. The daily `renew` job (systemd timer, launchd job or
   Windows scheduled task in `deploy/services/`) reissues the server
   certificate 60 days before it expires, or when the LAN address changes
   (`renew --ip <new-address>`), and reloads Caddy. Devices need nothing new.

## 2. Trust the CA on each device

Open **`http://<LAN-IP>:8080`** (for example `http://192.168.1.10:8080`) on the
device. **Compare the fingerprint** on that page with the one on the server
(`kinesis_pki.py status`). If they differ, stop: someone may be impersonating
the server.

### iPhone / iPad (Safari, home-screen app, native app)

1. Open the onboarding page **in Safari**, not Chrome. Tap
   **iPhone / iPad**, then **Allow**.
2. Open **Settings → Profile Downloaded → Install**. The profile shows as
   "Unverified" because it isn't signed; your fingerprint check is what
   establishes trust.
3. Open **Settings → General → About → Certificate Trust Settings** and turn
   on **Kinesis Local Root CA**. Without this step Safari still refuses the
   connection.
4. Open `https://kinesis.local` in Safari, then **Share → Add to Home Screen**.
5. **Open Kinesis from the Home Screen and pair the terminal there.**
   Home-screen apps keep their own cookies, separate from Safari, so a
   terminal paired in a Safari tab is not paired in the home-screen app.

To remove the CA: **Settings → General → VPN & Device Management → Kinesis
Local Root CA → Remove Profile**.

### Android (Chrome and the Kinesis app)

1. Open the onboarding page and tap **Android**. The certificate downloads.
2. Open **Settings → Security & privacy → More security settings →
   Encryption & credentials → Install a certificate → CA certificate**. The
   wording varies by manufacturer; search Settings for "CA certificate".
3. Select the downloaded `kinesis-root.crt`.

The native Kinesis app trusts user-installed CAs **only** for the Kinesis
server names (see `plugins/withKinesisNetworkSecurity.js`). Build it with
`EXPO_PUBLIC_API_URL=https://kinesis.local`, and set `KINESIS_TLS_HOSTS` to
add the IP address.

To remove the CA: **Encryption & credentials → User credentials**.

### Windows

Download `kinesis-root.crt`, double-click it, and choose **Install
Certificate → Local Machine → Place all certificates in the following store →
Trusted Root Certification Authorities**. Chrome and Edge use this store.
Firefox has its own store: **Settings → Privacy & Security → Certificates →
View Certificates → Authorities → Import**.

### macOS

Double-click `kinesis-root.crt`, add it to the **System** keychain, open
it in Keychain Access, and set **Trust → When using this certificate: Always
Trust**.

### Linux

Arch Linux: `sudo trust anchor --store kinesis-root.crt` (p11-kit; updates
`/etc/ca-certificates/trust-source/`). Debian/Ubuntu: copy the file to
`/usr/local/share/ca-certificates/kinesis-root.crt` and run
`sudo update-ca-certificates`. Fedora: `/etc/pki/ca-trust/source/anchors/`
and `update-ca-trust`. Firefox and Chrome may need the certificate imported
into their own stores.

## 3. Verify name constraints

Do this once per device type (iOS version, Android version, browser):

```sh
python deploy/pki/kinesis_pki.py --pki-dir /var/lib/kinesis/pki issue-constraint-test --out /tmp/ctest
```

Serve `/tmp/ctest/constraint-test.crt` and `.key` on a spare port, for example
a temporary Caddy site on `:9443`, and open `https://kinesis.local:9443` on
the device. **It must refuse the connection.** The certificate is valid for
`kinesis.local` but also names a forbidden host. If a device accepts it, it
does not enforce name constraints; record that in the security report.

## 4. Lost or stolen keys

| Situation | Action |
|---|---|
| Server stolen, or server files copied | The issuing CA key and server key are exposed. Run `rotate-intermediate` with the offline root key on the new server. Name constraints limit misuse to the Kinesis names and LAN ranges. |
| USB stick with the root key lost, passphrase safe | The key is encrypted. Create a new CA (`init --force`) at your convenience and re-onboard devices. |
| Root key **and** passphrase compromised | Run `init --force` immediately, remove the old "Kinesis Local Root CA" from every device, and onboard them again. |
| Unsure whether the offline root key or its passphrase still works | `verify-root-key --root-key <file>` (prompts for the passphrase, writes nothing, compares the key with `root-ca.crt`). Do this once a year. |
| Server's LAN address changed | `renew --ip <new-address>`, then update `caddy.env` site addresses. Addresses must stay in a private (RFC 1918) range. |
