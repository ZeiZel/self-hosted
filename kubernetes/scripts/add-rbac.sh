#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHARTS_DIR="$SCRIPT_DIR/../charts"
TEMPLATE_FILE="$SCRIPT_DIR/../.templates/rbac.yaml"
SKIP_CHARTS="coder excalidraw stalwart syncthing teamcity vault vaultwarden youtrack"

echo "Adding RBAC to charts..."
for chart_dir in "$CHARTS_DIR"/*; do
  [ ! -d "$chart_dir" ] && continue
  chart_name=$(basename "$chart_dir")
  [[ "$SKIP_CHARTS" =~ $chart_name ]] && echo "  Skipping $chart_name" && continue
  [ -f "$chart_dir/templates/rbac.yaml" ] && echo "  Skipping $chart_name (exists)" && continue

  echo "  Processing $chart_name..."
  mkdir -p "$chart_dir/templates"
  sed "s/CHARTNAME/$chart_name/g" "$TEMPLATE_FILE" > "$chart_dir/templates/rbac.yaml"

  VALUES_FILE="$chart_dir/values.yaml"
  if [ -f "$VALUES_FILE" ] && ! grep -q "^rbac:" "$VALUES_FILE"; then
    cat >> "$VALUES_FILE" <<EOF

# RBAC
rbac:
  create: true
  allowSecrets: false
  rules: []
EOF
    echo "    Added rbac section"
  fi
  echo "  ✓ Added RBAC to $chart_name"
done
echo "RBAC addition complete!"
