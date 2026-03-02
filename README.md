# 🚀 PingMyServer.de

> Lightweight, powerful uptime and monitoring system for websites, services and game servers.

---

## 🇩🇪 Deutsch

### 📌 Über das Projekt

**PingMyServer.de** ist ein modernes Monitoring-System zur Überwachung von:

- 🌐 Webseiten
- 🖥 APIs & Services
- 🎮 Game-Servern
- 📊 Uptime & Performance
- 🚨 Alerts & Statusseiten

Das Projekt dient der Bereitstellung einer stabilen, performanten und skalierbaren Monitoring-Infrastruktur.

---

## ⚖️ Rechtlicher Hinweis / Nutzungseinschränkung

❗ **Wichtiger Hinweis**

Der gesamte Quellcode dieses Repositories ist urheberrechtlich geschützt.

**Das Kopieren, Duplizieren, Veröffentlichen oder Wiederverwenden des Codes – vollständig oder teilweise – ist ausdrücklich untersagt.**

Dieses Repository dient ausschließlich:

- der internen Entwicklung,
- der technischen Dokumentation,
- der Vergewisserung der Funktionsweise,
- sowie dem Verständnis der Systemarchitektur hinter **PingMyServer.de**.

Jegliche Verwendung außerhalb dieses Zwecks ist nicht gestattet.

Bei Fragen zur Nutzung oder Zusammenarbeit bitte direkt Kontakt aufnehmen.

---

## 🏗 Architektur (Kurzüberblick)

Das Backend basiert auf einer modularen Node.js-Struktur:






Ziel ist eine klare Trennung von:

- Routing
- Business-Logik
- Datenzugriff
- Hintergrundprozessen
- Logging & Fehlerbehandlung

---

## 🇬🇧 English

### 📌 About the Project

**PingMyServer.de** is a modern uptime and monitoring system designed to monitor:

- 🌐 Websites
- 🖥 APIs & backend services
- 🎮 Game servers
- 📊 Uptime & performance metrics
- 🚨 Alerts & public status pages

The project focuses on stability, maintainability, and scalable monitoring infrastructure.

---

## ⚖️ Legal Notice / Usage Restriction

❗ **Important Notice**

All source code contained in this repository is protected by copyright.

**Copying, duplicating, redistributing, or reusing the code — in whole or in part — is strictly prohibited.**

This repository exists solely for:

- internal development purposes,
- technical documentation,
- verification of system behavior,
- and understanding the architecture behind **PingMyServer.de**.

Any use beyond these purposes is not permitted.

For collaboration or licensing inquiries, please contact the project owner directly.

---

## 🛠 Development Philosophy

PingMyServer follows these principles:

- Clear separation of concerns  
- Modular architecture  
- Centralized logging & error handling  
- Scalable monitoring workers  
- Clean API structure  

---

## 📬 Contact

For business inquiries, licensing, or collaboration:
**Please contact the project owner directly.**

---

© PingMyServer.de — All rights reserved.
---

## Distributed Probe Agents

You can run public probe workers without direct MySQL access now.

Server-side env:

- `PROBE_AGENT_TOKENS=ru:token-usually-long,us:another-token,hk:third-token`
- `PROBE_AGENT_TOKEN_HASH_SECRET=separate-secret-for-hashing-agent-tokens`
- `PROBE_AGENT_DEFAULT_BATCH_LIMIT=10`
- `PROBE_AGENT_MAX_BATCH_LIMIT=50`
- `PROBE_AGENT_RESULT_MAX_BATCH=50`
- `PROBE_AGENT_PAYLOAD_MAX_BYTES=262144`

Remote agent env (per probe server):

- `PROBE_AGENT_API_URL=https://your-domain.tld`
- `PROBE_AGENT_ID=ru`
- `PROBE_AGENT_TOKEN=token-usually-long`
- `PROBE_AGENT_LOOP_INTERVAL_MS=10000`
- `PROBE_AGENT_JOB_LIMIT=10`
- `PROBE_AGENT_CONCURRENCY=4`
- `PROBE_AGENT_API_TIMEOUT_MS=15000`
- `PROBE_AGENT_RUN_ONCE=false`

Start a remote probe agent with:

`npm run probe-agent`

The remote agent pulls jobs from `/api/probe-agent/jobs`, executes HTTP checks, and pushes results back to `/api/probe-agent/results`.

If your host only starts Node apps on incoming web requests (for example some cPanel Passenger setups), run the agent from Cron instead:

`npm run probe-agent:once`

You can also force one-shot mode with `PROBE_AGENT_RUN_ONCE=true`.
