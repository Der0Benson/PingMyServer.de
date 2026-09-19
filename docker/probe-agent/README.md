# PingMyServer Community Probe

Der Community-Probe-Agent holt maximal zehn kurzlebige Prüfaufträge von PingMyServer ab, prüft ausschließlich freigegebene öffentliche HTTP(S)-Ziele und sendet die Ergebnisse zurück. Der Container öffnet keine Ports und benötigt keine eingehenden Verbindungen.

## Installation

Voraussetzungen: Docker Engine mit Docker Compose.

```bash
cd docker/probe-agent
cp .env.example .env
mkdir -p secrets
printf '%s' 'VOM_BETREIBER_AUSGEGEBENER_TOKEN' > secrets/probe-agent-token.txt
chmod 600 secrets/probe-agent-token.txt
docker compose up -d --build
```

In `.env` müssen `PROBE_AGENT_API_URL` und `PROBE_AGENT_ID` durch die vom Betreiber ausgegebenen Angaben ersetzt werden.

## Sicherheitsgrenzen

- API-Kommunikation benötigt standardmäßig HTTPS.
- Der Agent akzeptiert höchstens zehn Aufträge pro Abruf.
- Standardmäßig sind nur die Zielports 80 und 443 erlaubt.
- Private, lokale, reservierte und Dokumentations-IP-Netze werden clientseitig abgewiesen.
- Jeder Auftrag enthält eine kurzlebige, serverseitig signierte Lease.
- Eine Lease ist an Agent, Auftrag und Monitor gebunden und kann nur einmal verbucht werden.
- Der Container läuft ohne Root-Rechte, ohne Linux-Capabilities und mit schreibgeschütztem Dateisystem.

Zusätzliche Zielports können bewusst über `PROBE_AGENT_ALLOWED_TARGET_PORTS` freigegeben werden. Unsicheres HTTP zur API lässt sich nur für lokale Entwicklung mit `PROBE_AGENT_ALLOW_INSECURE_HTTP=true` aktivieren und ist nicht in der Compose-Vorlage enthalten.

## Betrieb

```bash
docker compose logs -f agent
docker compose pull
docker compose up -d --build
docker compose down
```

Der Token gehört ausschließlich in `secrets/probe-agent-token.txt`. Der Ordner `secrets/` wird von Git ignoriert.
