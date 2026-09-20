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
| Community | 3 | 60 Sekunden | Wird freigeschaltet, solange mindestens ein eigener, vertrauenswürdiger Probe-Agent live ist |
| Bezahlt | konfigurierbares Limit | 30 Sekunden | Erweiterte Kapazität und schnellere Prüfungen |

Für aktive Community-Verbindungen ist ein Abo-Rabatt von 40 Prozent vorgesehen. Der Rabatt wird erst nach einer separaten Vertrauensprüfung angewendet; ein Heartbeat allein löst keine Stripe-Gutschrift aus.

Die Messdaten werden je Stufe unterschiedlich lange gespeichert:

| Stufe | Einzelmessungen | Tageswerte |
| --- | ---: | ---: |
| Kostenlos | 24 Stunden | 30 Tage |
| Community | 7 Tage | 180 Tage |
| Bezahlt | 30 Tage | 730 Tage |

## Community-Probes

Ein Community-Probe-Agent läuft als kleiner Docker-Container auf einem externen Server. Er holt höchstens zehn kurzlebige Aufträge ab, prüft freigegebene öffentliche HTTP(S)-Ziele und sendet die Ergebnisse zurück. Es sind weder offene Ports noch eingehende Verbindungen erforderlich.

Der Agent ist bewusst begrenzt:

- API-Zugriff über einen nur einmal angezeigten Token, serverseitig nur als Hash gespeichert
- HTTPS-Zwang für die Verbindung zu PingMyServer
- Sperre privater, lokaler und reservierter Zielnetze
- standardmäßige Beschränkung auf die Zielports 80 und 443
- signierte, kurzlebige und nur einmal verwendbare Job-Leases
- serverseitiger Trustscore mit Referenzvergleichen, Auditspur und automatischer Quarantäne
- Ausschluss ungeprüfter oder quarantänisierter Ergebnisse vom offiziellen Monitorstatus
- nichtprivilegierter Container ohne Linux-Capabilities und mit schreibgeschütztem Dateisystem

Neue Agenten starten in einer Probezeit. Die Freigabe erfordert mindestens 50 bestätigte Vergleiche, einen Trustscore von 70/100, eine geringe Abweichungsquote und 24 Stunden Laufzeit. Ein Heartbeat oder eine große Zahl ungeprüfter Resultate reicht nicht. Der Trustscore reduziert Manipulationsrisiken, ersetzt aber keinen kryptografischen Nachweis der Messung; eigene Server-Probes bleiben die maßgebliche Referenz.

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

### Schreibpfad für Messdaten

Konfiguration und aktueller Monitorstatus bilden den Control-Bereich; Einzelmessungen und Tageswerte bilden den Telemetry-Bereich. Der Scheduler lädt pro Lauf standardmäßig höchstens 64 fällige Monitore. Resultate werden bis zu 250 Millisekunden gesammelt und anschließend in Blöcken von bis zu 64 Einträgen gespeichert. Dadurch erzeugen 64 Checks nicht mehr je einen separaten Schreibvorgang für Historie und Status.

Jede prüfungsrelevante Änderung erhöht `monitors.config_version`. Scheduler und Community-Agent übernehmen diese Version in Auftrag und Resultat. Beim Speichern wird der Monitor kurz gesperrt; stimmt die Version nicht mehr, wird das verspätete Resultat vollständig verworfen. Community-Leases signieren die Konfigurationsversion mit.

Die Trennung ist bewusst als sichere erste Ausbaustufe innerhalb einer MySQL-Instanz umgesetzt: Control- und Telemetry-Tabellen haben klare Zuständigkeiten, bleiben für atomare Statusupdates aber in derselben Transaktion. Eine Verteilung auf zwei physische Datenbankserver erfordert danach einen idempotenten Outbox-/Consumer-Pfad; ohne diesen würde ein Teilausfall zwischen beiden Datenbanken Messhistorie und aktuellen Status auseinanderlaufen lassen.

Details zu Tabellen, Schreibpfad und sicherer physischer Trennung stehen in [docs/storage-architecture.md](docs/storage-architecture.md).

Relevante optionale Laufzeitwerte:

- `CHECK_DISPATCH_BATCH_SIZE` – fällige Monitore pro Scheduler-Lauf, Standard `64`
- `TELEMETRY_WRITE_BATCH_SIZE` – maximale Resultate pro Schreibblock, Standard `64`
- `TELEMETRY_WRITE_FLUSH_MS` – maximale Sammelzeit eines unvollständigen Blocks, Standard `250`

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
