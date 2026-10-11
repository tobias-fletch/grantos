#!/usr/bin/env bash
# Matching client tools without installing host packages. Only for disposable CI.
set -euo pipefail
if [[ $# != 1 || ! "$1" = /* ]]; then
  echo 'Usage: ci-postgres-tools.sh ABSOLUTE_OUTPUT_DIRECTORY' >&2
  exit 1
fi
mkdir -p "$1"
for tool in pg_dump pg_restore; do
  cat > "$1/$tool" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
exec docker run --rm --network host -i \\
  -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE \\
  postgres:18 $tool "\$@"
SCRIPT
  chmod 700 "$1/$tool"
done
