#!/usr/bin/env sh
set -eu

REPOSITORY_URL="https://github.com/Der0Benson/PingMyServer.de.git"
DEFAULT_API_URL="https://pingmyserver.de"
DEFAULT_INSTALL_DIR="${PWD}/pingmyserver-agent"

usage() {
  cat <<'EOF'
PingMyServer Community-Probe installieren

Verwendung:
  install.sh --id PROBE_ID [--api-url HTTPS_URL] [--install-dir PFAD]

Der API-Token wird verdeckt abgefragt und nicht als Argument übergeben.
Docker Engine, Docker Compose, Git und curl müssen bereits installiert sein.
EOF
}

fail() {
  printf 'Fehler: %s\n' "$1" >&2
  exit 1
}

probe_id=""
api_url="$DEFAULT_API_URL"
install_dir="$DEFAULT_INSTALL_DIR"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --id)
      [ "$#" -ge 2 ] || fail "Nach --id fehlt die Agent-ID."
      probe_id="$2"
      shift 2
      ;;
    --api-url)
      [ "$#" -ge 2 ] || fail "Nach --api-url fehlt die URL."
      api_url="$2"
      shift 2
      ;;
    --install-dir)
      [ "$#" -ge 2 ] || fail "Nach --install-dir fehlt der Pfad."
      install_dir="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unbekannte Option: $1"
      ;;
  esac
done

[ -n "$probe_id" ] || fail "Die Agent-ID fehlt. Nutze --id PROBE_ID."
case "$probe_id" in
  pa_[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) fail "Die Agent-ID hat ein ungültiges Format." ;;
esac

case "$api_url" in
  https://*) ;;
  *) fail "Die API-URL muss HTTPS verwenden." ;;
esac
case "$api_url" in
  *[!A-Za-z0-9:/._~-]*) fail "Die API-URL enthält nicht erlaubte Zeichen." ;;
esac
api_url="${api_url%/}"

for command_name in docker git; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name ist nicht installiert."
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 ist nicht verfügbar."

if [ -e "$install_dir" ]; then
  fail "Das Installationsziel existiert bereits: $install_dir"
fi

printf 'API-Token (Eingabe bleibt unsichtbar): '
[ -r /dev/tty ] || fail "Für die sichere Token-Eingabe wird ein Terminal benötigt."
trap 'stty echo < /dev/tty 2>/dev/null || true' EXIT HUP INT TERM
stty -echo < /dev/tty 2>/dev/null || true
IFS= read -r token < /dev/tty
stty echo < /dev/tty 2>/dev/null || true
trap - EXIT HUP INT TERM
printf '\n'

[ "${#token}" -eq 50 ] || fail "Der API-Token hat ein ungültiges Format."
case "$token" in
  pms_pa_*) ;;
  *) fail "Der API-Token hat ein ungültiges Format." ;;
esac
case "$token" in
  *[!A-Za-z0-9_-]*) fail "Der API-Token hat ein ungültiges Format." ;;
esac

umask 077
printf 'Lade PingMyServer Community-Probe...\n'
git clone --depth 1 --branch main "$REPOSITORY_URL" "$install_dir" >/dev/null 2>&1 || fail "Repository konnte nicht geladen werden."

agent_dir="$install_dir/docker/probe-agent"
mkdir -p "$agent_dir/secrets"
printf '%s\n' "$token" > "$agent_dir/secrets/probe-agent-token.txt"
chmod 600 "$agent_dir/secrets/probe-agent-token.txt"
cat > "$agent_dir/.env" <<EOF
PROBE_AGENT_API_URL=$api_url
PROBE_AGENT_ID=$probe_id
PROBE_AGENT_JOB_LIMIT=10
PROBE_AGENT_CONCURRENCY=4
PROBE_AGENT_LOOP_INTERVAL_MS=10000
PROBE_AGENT_ALLOWED_TARGET_PORTS=80,443
EOF
chmod 600 "$agent_dir/.env"

printf 'Baue und starte den Agenten...\n'
docker compose --project-directory "$agent_dir" -f "$agent_dir/compose.yml" up -d --build

token=""

printf '\nAgent installiert und gestartet.\n'
printf 'Status: docker compose --project-directory %s -f %s/compose.yml ps\n' "$agent_dir" "$agent_dir"
printf 'Logs:   docker compose --project-directory %s -f %s/compose.yml logs -f agent\n' "$agent_dir" "$agent_dir"
