#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHARTS_DIR="$SCRIPT_DIR/../charts"
TEMPLATE_FILE="$SCRIPT_DIR/../.templates/test-connection.yaml"

echo "Adding Helm tests to charts..."
for chart_dir in "$CHARTS_DIR"/*; do
  [ ! -d "$chart_dir" ] && continue
  chart_name=$(basename "$chart_dir")
  [ -f "$chart_dir/templates/tests/test-connection.yaml" ] && echo "  Skipping $chart_name (exists)" && continue

  echo "  Processing $chart_name..."
  mkdir -p "$chart_dir/templates/tests"
  sed "s/CHARTNAME/$chart_name/g" "$TEMPLATE_FILE" > "$chart_dir/templates/tests/test-connection.yaml"
  echo "  ✓ Added test to $chart_name"
done
echo "Helm tests addition complete!"
