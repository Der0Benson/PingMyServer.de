# PingMyServer.de

PingMyServer.de überwacht Webseiten und HTTP(S)-Dienste, dokumentiert Ausfälle und informiert Nutzer, wenn ein Dienst ausfällt oder wieder erreichbar ist. Neben dem klassischen zentralen Monitoring kann die Plattform Prüfungen an freiwillig betriebene Community-Probes verteilen.

## Funktionsumfang

- HTTP(S)-Monitoring mit konfigurierbaren Prüfintervallen
- Dashboard mit Verfügbarkeit, Antwortzeiten und Fehlerverlauf
- E-Mail-Benachrichtigungen bei Ausfall und Wiederherstellung
- Öffentliche Statusseiten und Incident-Verwaltung
- Anmeldung per E-Mail sowie unterstützte OAuth-Anbieter
- Stripe-Anbindung für bezahlte Accounts
- Community-Probe-Agenten mit Live-Status, Beitragsstatistiken und optionalen Zusammenfassungen

## Account-Stufen

| Stufe | Monitore | Kürzestes Prüfintervall | Besonderheit |
| --- | ---: | ---: | --- |
| Kostenlos | 1 | 60 Sekunden | Grundfunktionen ohne Zahlung |
| Community | 3 | 60 Sekunden | Wird freigeschaltet, solange mindestens ein eigener Probe-Agent live ist |
| Bezahlt | konfigurierbares Limit | 30 Sekunden | Erweiterte Kapazität und schnellere Prüfungen |

Für aktive Community-Verbindungen ist ein Abo-Rabatt von 40 Prozent vorgesehen. Der Rabatt wird erst nach einer separaten Vertrauensprüfung angewendet; ein Heartbeat allein löst keine Stripe-Gutschrift aus.

## Community-Probes

Ein Community-Probe-Agent läuft als kleiner Docker-Container auf einem externen Server. Er holt höchstens zehn kurzlebige Aufträge ab, prüft freigegebene öffentliche HTTP(S)-Ziele und sendet die Ergebnisse zurück. Es sind weder offene Ports noch eingehende Verbindungen erforderlich.

Der Agent ist bewusst begrenzt:

- API-Zugriff über einen nur einmal angezeigten Token, serverseitig nur als Hash gespeichert
- HTTPS-Zwang für die Verbindung zu PingMyServer
- Sperre privater, lokaler und reservierter Zielnetze
- standardmäßige Beschränkung auf die Zielports 80 und 443
- signierte, kurzlebige und nur einmal verwendbare Job-Leases
- nichtprivilegierter Container ohne Linux-Capabilities und mit schreibgeschütztem Dateisystem

Installation und Betrieb sind in [docker/probe-agent/README.md](docker/probe-agent/README.md) beschrieben. Das serverseitige Sicherheits- und Lease-Modell steht in [docs/community-probe-protocol.md](docs/community-probe-protocol.md).

## Architektur

Das Backend verwendet Node.js mit CommonJS und MySQL. Der Einstiegspunkt `server.js` startet die Anwendung aus `src/`. Neue Funktionen sind nach Verantwortlichkeit gegliedert:

- `src/modules/` – fachliche Module, Controller, Services und Repositories
- `src/core/` – Logging und zentrale Fehlerbehandlung
- `src/legacy/` – bestehende Laufzeitlogik während der schrittweisen Modularisierung
- `src/probe-agent/` – Sicherheitsregeln des Probe-Clients
- `public/` – Dashboard und öffentliche Seiten
- `migrations/` – fortlaufende Datenbankmigrationen
- `test/` – Tests mit dem integrierten Node.js-Test-Runner

Die Modularisierung ist absichtlich schrittweise: bestehendes Verhalten bleibt in `src/legacy/`, bis der jeweilige Bereich mit eigenen Schnittstellen und Tests herausgelöst wurde.

## Lokale Entwicklung

Vorausgesetzt werden eine aktuelle Node.js-Version und eine erreichbare MySQL-Datenbank.

```bash
npm install
npm test
npm start
```

Vor dem Start müssen die Datenbankmigrationen in numerischer Reihenfolge angewendet und die für die gewünschte Umgebung benötigten Variablen gesetzt werden. Geheimnisse gehören ausschließlich in die Laufzeitumgebung oder vorgesehene Secret-Dateien und nicht in das Repository.

## Rechtlicher Hinweis

Der Quellcode ist urheberrechtlich geschützt. Kopieren, Veröffentlichen oder Wiederverwenden des Codes – vollständig oder teilweise – ist ohne ausdrückliche Erlaubnis nicht gestattet. Das Repository dient der internen Entwicklung, technischen Dokumentation und Nachvollziehbarkeit der Systemarchitektur.

Anfragen zu Zusammenarbeit oder Lizenzierung bitte direkt an den Projektinhaber richten.
