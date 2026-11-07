# Windows service setup (templates)

Run in an **elevated PowerShell**. Paths assume the layout in
`docs/deployment/ARCHITECTURE.md`:

| Path | Contents |
|---|---|
| `C:\Program Files\Kinesis\` | `app\` (repository), `venv\`, `bin\caddy.exe`, `bin\kinesis-backend.exe` (WinSW) |
| `C:\ProgramData\Kinesis\` | `config\`, `pki\`, `onboarding\`, `uploads\`, `backups\`, `logs\` |

Use forward slashes in `caddy.env` (`C:/ProgramData/Kinesis`).

## 1. Lock down the data directory

`chmod`-style permissions do not exist on Windows; the ACL protects the
database password, the TLS keys and the backups.

```powershell
$data = "C:\ProgramData\Kinesis"
icacls $data /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"
```

Both services below run as `LocalSystem`, which is covered by that ACL.
(Separate virtual service accounts can be used instead; grant them access
to the specific subfolders.)

## 2. Backend service (WinSW)

The PostgreSQL service name in `kinesis-backend.xml` (`<depend>`) must match
the installed one: `Get-Service postgresql*`.

```powershell
Copy-Item .\kinesis-backend.xml "C:\Program Files\Kinesis\bin\"
cd "C:\Program Files\Kinesis\bin"
.\kinesis-backend.exe install
.\kinesis-backend.exe start
```

## 3. Caddy service (built-in Windows service support)

```powershell
sc.exe create kinesis-caddy start= delayed-auto depend= kinesis-backend `
  binPath= "`"C:\Program Files\Kinesis\bin\caddy.exe`" run --config `"C:\Program Files\Kinesis\app\deploy\caddy\Caddyfile`" --adapter caddyfile --envfile `"C:\ProgramData\Kinesis\config\caddy.env`""
sc.exe failure kinesis-caddy reset= 3600 actions= restart/5000/restart/10000/restart/30000
sc.exe start kinesis-caddy
```

## 4. Daily certificate renewal (Task Scheduler)

```powershell
$py  = "C:\Program Files\Kinesis\venv\Scripts\python.exe"
$pki = "C:\Program Files\Kinesis\app\deploy\pki\kinesis_pki.py"
$action  = New-ScheduledTaskAction -Execute $py -Argument "`"$pki`" --pki-dir C:\ProgramData\Kinesis\pki renew"
$trigger = @(New-ScheduledTaskTrigger -Daily -At 3:30am; New-ScheduledTaskTrigger -AtStartup)
Register-ScheduledTask -TaskName "Kinesis certificate renewal" -TaskPath "\Kinesis\" `
  -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest
```

## 5. Firewall (private network profile only)

```powershell
New-NetFirewallRule -DisplayName "Kinesis HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80,443,8443 -Profile Private -Action Allow
New-NetFirewallRule -DisplayName "Kinesis onboarding" -Direction Inbound -Protocol TCP -LocalPort 8080 -Profile Private -Action Allow
New-NetFirewallRule -DisplayName "Kinesis mDNS" -Direction Inbound -Protocol UDP -LocalPort 5353 -Profile Private -Action Allow
```

Make sure the shop network is set to **Private** (Settings > Network >
Properties). Port 8000 (backend) and 5432 (PostgreSQL) must **not** be opened.

## 6. Power

A laptop used as the server must not sleep on mains power:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```
