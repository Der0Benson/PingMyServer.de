# Community-Probe-Protokoll v1

## Ziel

Community-Probes führen bis zu zehn HTTP(S)-Prüfungen aus, ohne eingehende Ports zu öffnen. Die Zentrale validiert Ziele, weist Aufträge zu und akzeptiert nur Ergebnisse zu gültigen Aufträgen.

## Authentifizierung

Jeder angemeldete Nutzer kann im Bereich **Connections** einen Agenten anlegen. Dabei werden eine eindeutige `probeId` und ein zufälliger API-Token erzeugt. Der Token wird nur einmal angezeigt; serverseitig liegt ausschließlich sein HMAC-Hash in `community_probe_agents`.

```dotenv
PROBE_AGENT_JOB_LEASE_SECRET=EIN_UNABHAENGIGES_ZUFAELLIGES_SECRET
PROBE_AGENT_TOKEN_HASH_SECRET=EIN_WEITERES_ZUFAELLIGES_SECRET
```

Geeignete Server-Secrets lassen sich beispielsweise mit `openssl rand -hex 32` erzeugen. Der Agent-Token wird nur über HTTPS im Bearer-Header übertragen und im Container als Docker-Secret eingebunden. Ein im Dashboard gesperrter Agent verliert unmittelbar den API-Zugriff.

`PROBE_AGENT_JOB_LEASE_SECRET` ist absichtlich verpflichtend und muss unabhängig von Datenbank- und Sitzungspasswörtern gesetzt werden.

## Auftrags-Lease

Jeder von `GET /api/probe-agent/jobs` ausgegebene Auftrag enthält:

- eine zufällige `jobId`,
- die Ablaufzeit `expiresAt`,
- ein HMAC-signiertes `leaseToken`, das Agent, Auftrag und Monitor bindet.

Der Agent sendet `jobId` und `leaseToken` mit dem Ergebnis zurück. Die API lehnt veränderte, abgelaufene, fremde und bereits verwendete Leases ab. Pro Agent und Monitor kann nur eine aktive Zuweisung existieren. Zehn eindeutige serverseitige Slots begrenzen jeden Agenten auch bei parallelen oder manipulierten Abrufen auf höchstens zehn aktive Aufträge. Verwendete Job-IDs und Beitragsstatistiken werden 35 Tage gespeichert; die Lease selbst ist standardmäßig zwei Minuten gültig.

## Clientseitige Grenzen

- höchstens zehn Jobs pro Abruf,
- ausschließlich HTTP und HTTPS,
- standardmäßig ausschließlich Ports 80 und 443,
- Verbindung nur zu einer von der Zentrale vorab aufgelösten öffentlichen IP-Adresse,
- keine URL-Zugangsdaten,
- keine Redirects auf andere Hostnamen,
- begrenzte Timeouts, Antwortgrößen und Parallelität.

## Bedrohungsmodell

Die Lease verhindert, dass ein Agent Ergebnisse für nicht zugewiesene Monitore einreicht oder einen Auftrag mehrfach verbuchen lässt. Sie kann nicht beweisen, dass der Betreiber eines fremden Servers eine tatsächlich ausgeführte Messung unverändert meldet.

Bevor ein Rabatt automatisch vergeben wird, müssen deshalb zusätzlich mehrere unabhängige Probes, verdeckte Kontrollziele und ein serverseitiger Zuverlässigkeitswert eingeführt werden. Ein einzelner Community-Agent darf niemals allein einen Ausfall oder eine Vergütung bestimmen.

## Community-Vorteile

- Free-Konten können einen Monitor mit einem Mindestintervall von 60 Sekunden verwenden.
- Solange mindestens ein eigener Community-Agent live ist, steigt das kostenlose Limit auf drei Monitore.
- Bezahlte Konten dürfen weiterhin 30-Sekunden-Checks verwenden.
- Das Dashboard zeigt akzeptierte Checks für 24 Stunden, 7 Tage und 30 Tage.
- Nutzer können eine wöchentliche oder monatliche E-Mail-Zusammenfassung aktivieren.
- Der angekündigte Rabatt von 40 Prozent wird erst nach der separaten Vertrauensprüfung automatisch auf Stripe angewendet. Ein Heartbeat allein reicht dafür ausdrücklich nicht aus.
