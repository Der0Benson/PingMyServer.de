# Control- und Telemetry-Speicher

## Zielbild

Die Daten sind fachlich in zwei Bereiche getrennt:

| Control | Telemetry |
| --- | --- |
| Nutzer, Anmeldung und Abrechnung | Einzelne Monitor-Checks |
| Monitor-Ziel, Intervall und Assertions | Einzelne Standort-Checks |
| Pausen- und Benachrichtigungseinstellungen | Tagesstatistiken und Fehlercodes |
| Community-Agenten, Leases und Receipts | Langfristige Messhistorie |
| Aktueller kompakter Monitorstatus |  |

Der aktuelle Status bleibt im Control-Bereich, weil Dashboard, Alarmierung und Scheduler genau einen kleinen Datensatz pro Monitor benötigen. Die wachsende Zeitreihe liegt im Telemetry-Bereich.

## Aktueller Schreibpfad

1. Der Scheduler beansprucht höchstens `CHECK_DISPATCH_BATCH_SIZE` fällige Monitore.
2. Jeder Check übernimmt `config_version` aus der geladenen Konfiguration.
3. Der Write-Buffer sammelt bis zu `TELEMETRY_WRITE_BATCH_SIZE` Resultate oder wartet höchstens `TELEMETRY_WRITE_FLUSH_MS`.
4. Die Batch-Transaktion sperrt die betroffenen Monitorzeilen und verwirft Resultate mit einer alten Version.
5. Gültige Historienzeilen werden mit einer eindeutigen `result_id` gemeinsam eingefügt.
6. Die kompakten Statuszeilen werden mit einem einzigen mengenbasierten Update aktualisiert.

Community-Jobs tragen die Konfigurationsversion zusätzlich in ihrer signierten Lease. Ein Client kann sie daher nicht auf eine neuere Version umschreiben.

## Aufbewahrung

| Klasse | Rohdaten | Tageswerte |
| --- | ---: | ---: |
| `free` | 1 Tag | 30 Tage |
| `community` | 7 Tage | 180 Tage |
| `pro` | 30 Tage | 730 Tage |

Vor dem Löschen von Rohdaten wird geprüft, ob der entsprechende Tageswert existiert. Ein fehlgeschlagener Verdichtungslauf kann daher keine noch nicht aggregierten Messungen entfernen.

## Physische Trennung

Die erste Stufe hält beide Bereiche in derselben MySQL-Instanz. Das ermöglicht eine atomare Transaktion zwischen Historie und aktuellem Status und kann ohne verteilte Fehlerzustände ausgerollt werden.

Für zwei physische Datenbankserver ist als nächste Stufe ein transaktionaler Outbox-Pfad vorgesehen:

1. Status und Outbox-Ereignis werden atomar in Control gespeichert.
2. Ein Consumer schreibt jedes Ereignis anhand der `result_id` idempotent nach Telemetry.
3. Erst bestätigte Ereignisse werden aus der Outbox entfernt.
4. Historienabfragen verwenden anschließend ausschließlich die Telemetry-Verbindung.

Ein direkter Doppel-Write auf zwei Server wird bewusst vermieden, weil bei einem Teilausfall sonst nicht bestimmbar wäre, welche Seite den gültigen Stand besitzt.

## Migration

`migrations/022_control_telemetry_storage.sql` ergänzt:

- `monitors.config_version`
- `monitors.retention_class`
- einen Index für die Auswahl fälliger Monitore
- `monitor_checks.result_id`
- die gespeicherte Konfigurationsversion jeder Messung

Die Laufzeit prüft dieselben Spalten beim Start, damit bestehende Installationen während eines kontrollierten Rollouts kompatibel bleiben.
