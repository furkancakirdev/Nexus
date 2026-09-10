# Nexus Environment Baseline

> Capture date: 2026-09-09  
> Scope: local checkout and authorized Nexus host `192.168.12.11`  
> Safety: metadata-only collection; no deployment, restart, database write, secret-file read, or private-key read was performed.

## 1. Local checkout

### Toolchain commands and outputs

Commands were executed from the repository root:

```text
node --version
v24.12.0

npm --version
11.6.2

python --version
Python 3.14.2

docker --version
Docker version 29.7.2, build a7dcaa6

git rev-parse --show-toplevel
C:/Users/furkan.cakir/Documents/Marlin Yönetim Paneli

git rev-parse HEAD
fc76597738b1ca25ac33e9c8df4007cd65467d82
```

The local PowerShell metadata collector was also prepared under the system temporary directory and removed after execution. Its intended fields were OS version, PowerShell version, architecture, Node, npm, Python, Docker, Compose, Git, and hostname. The host tooling outputs above are retained; no full environment-variable dump was collected.

### Application/framework/dependency versions

Source and manifest evidence:

- Frontend: React `19.2.0`, React DOM `19.2.0`, Vite `6.4.3`, `@vitejs/plugin-react` `5.0.4`.
- Backend: Node.js ESM, Express `5.2.1`, `mssql` `12.7.0`.
- UI/data dependencies: Recharts `3.9.1`, Tabler Icons React `3.44.0`.
- Development: concurrently `10.0.4`.
- Build source: `Dockerfile`, `vite.config.mjs`, `package.json`.

`npm list --depth=0` reported the dependency versions above with no extraneous package output.

## 2. Remote Nexus host

### OS and runtime

Command:

```sh
ssh -o BatchMode=yes -o NumberOfPasswordPrompts=0 -o ConnectTimeout=8 \
  serviceproadmin@192.168.12.11 \
  "cat /etc/os-release | grep -E '^(PRETTY_NAME|VERSION_ID)='; uname -srmo; hostname; node --version || true; npm --version || true; python3 --version || true; docker --version || true; docker compose version || true"
```

Redacted output:

```text
PRETTY_NAME="Ubuntu 24.04.4 LTS"
VERSION_ID="24.04"
Linux 6.8.0-134-generic x86_64 GNU/Linux
linux-01
Python 3.12.3
Docker version 29.3.0, build 5927d80
Docker Compose version v5.1.1
```

Node/npm were not installed on the host shell; the application runtime is inside the Node container.

### Ports and services

Command:

```sh
ssh serviceproadmin@192.168.12.11 \
  "ss -lnt | grep -E '(:22 |:4318 |:14337 )' || true; \
   systemctl is-active docker || true; systemctl is-active caddy || true"
```

Output:

```text
LISTEN 0 4096 127.0.0.1:14337 0.0.0.0:*
LISTEN 0 4096 0.0.0.0:22 0.0.0.0:*
LISTEN 0 4096 0.0.0.0:4318 0.0.0.0:*
LISTEN 0 4096 [::]:22 [::]:*
LISTEN 0 4096 [::]:4318 [::]:*
active
inactive
```

Interpretation:

- SSH listens on TCP 22.
- Caddy/Nexus public edge listens on TCP 4318 (IPv4 and IPv6).
- A local-only application/candidate port is bound on `127.0.0.1:14337`.
- Docker systemd service is active; host-level `caddy` systemd service is inactive because Caddy runs as a container.

### Containers and processes

Command:

```sh
ssh serviceproadmin@192.168.12.11 \
  "docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' | sort; \
   ps -eo user,pid,comm,args | grep -E '[n]ode|[c]addy|[d]ockerd'"
```

Redacted output summary:

```text
marlin-nexus-candidate-fc76597 | marlin-profit-sharing:release-fc76597 | Up 3 minutes | 127.0.0.1:14332->4318/tcp
marlin-profit-sharing          | marlin-profit-sharing:release-072dc83 | Up 28 minutes | 127.0.0.1:14337->4318/tcp
nexus-caddy                    | caddy:2.8 | Up About an hour | 0.0.0.0:4318->4318/tcp

root      dockerd /usr/bin/dockerd -H fd://...
root      caddy   caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
service+  node    node server/index.mjs
service+  node    node server/index.mjs
```

The process command line included an operator release/rollback shell command in the host process listing. Secret-bearing values were not captured; this artifact retains only the process roles and image identifiers.

### Deployment/image metadata

Command:

```sh
ssh serviceproadmin@192.168.12.11 \
  "docker inspect marlin-profit-sharing --format \
   'app_image={{.Config.Image}} image_id={{.Image}} created={{.Created}} ports={{json .NetworkSettings.Ports}}'; \
   docker inspect nexus-caddy --format \
   'edge_image={{.Config.Image}} image_id={{.Image}} created={{.Created}}'"
```

Output:

```text
compose=/home/serviceproadmin/apps/marlin-profit-sharing/compose.yaml mode=664 owner=serviceproadmin size=1934
app_image=marlin-profit-sharing:release-fc76597 image_id=sha256:eb1996b904e0cfa935e7552a526facf6c717b38e5950f803f5d171d5ceca33ab created=2026-09-09T22:01:41.439482574Z ports={"4318/tcp":null}
edge_image=caddy:2.8 image_id=sha256:226d1f059b75399fe19182893c7184591c07b97afc8dfcf44eeb80c9a77a530f created=2026-09-09T20:37:32.105237633Z
```

The host Compose file is `/home/serviceproadmin/apps/marlin-profit-sharing/compose.yaml`, mode `664`, owner `serviceproadmin`. Secret file contents were not read.

### TLS certificate metadata

Command:

```sh
ssh serviceproadmin@192.168.12.11 \
  "openssl x509 -in /home/serviceproadmin/.marlin-nexus-pki/server.crt \
   -noout -subject -issuer -dates -serial -fingerprint -sha256"
```

Output:

```text
subject=CN = 192.168.12.11, O = Marlin Yatcilik
issuer=CN = Marlin Nexus Internal Root CA, O = Marlin Yatcilik
notBefore=Aug 27 13:03:37 2026 GMT
notAfter=Sep 28 13:03:37 2027 GMT
serial=04325E836D0662CC386FADD8F7C5EC22E739E485
sha256 Fingerprint=F1:BF:F7:A8:5D:2D:B8:FA:D3:E8:D9:45:00:24:92:60:C8:DB:65:4F:B4:12:76:CA:81:6D:E3:BC:BF:E2:C2:CF
```

Only public certificate metadata was read. The private key was not accessed. Certificate trust-chain validation remains a separate requirement for clients because the issuer is an internal CA.

## 3. Collection limitations and follow-up

- The first combined remote probe failed during shell quoting before collecting data; it did not mutate remote state. Independent commands were then used successfully.
- The initial local PowerShell collector was emitted literally by the shell wrapper rather than executed; direct version commands supplied the authoritative local toolchain values.
- No full environment-variable dump, secret mount content, credential file, TLS private key, database connection, or production mutation was performed.
- Remote Node/npm versions should be recorded from the running application image with `docker exec` only if an operator authorizes that read-only inspection; the host shell does not install Node/npm.
- The candidate container and rollback-related process indicate an active release validation context. Production readiness still requires authenticated readiness, TLS trust validation, and owner review of the deployment state.

**Baseline status:** `LOCAL_TOOLCHAIN_CAPTURED`, `REMOTE_OS_CAPTURED`, `PORTS_SERVICES_CAPTURED`, `CONTAINERS_PROCESSES_CAPTURED`, `DEPLOYMENT_IMAGES_CAPTURED`, `TLS_PUBLIC_METADATA_CAPTURED`, `SECRETS_UNREAD`.
