#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHARTS_DIR="$SCRIPT_DIR/../charts"
TEMPLATE_FILE="$SCRIPT_DIR/../.templates/servicemonitor.yaml"
SKIP_CHARTS="coder metube remnawave vert"

echo "Adding ServiceMonitor to charts..."
for chart_dir in "$CHARTS_DIR"/*; do
  [ ! -d "$chart_dir" ] && continue
  chart_name=$(basename "$chart_dir")
  [[ "$SKIP_CHARTS" =~ $chart_name ]] && echo "  Skipping $chart_name" && continue
  [ -f "$chart_dir/templates/servicemonitor.yaml" ] && echo "  Skipping $chart_name (exists)" && continue

  echo "  Processing $chart_name..."
  mkdir -p "$chart_dir/templates"
  sed "s/CHARTNAME/$chart_name/g" "$TEMPLATE_FILE" > "$chart_dir/templates/servicemonitor.yaml"

  VALUES_FILE="$chart_dir/values.yaml"
  if [ -f "$VALUES_FILE" ] && ! grep -q "^metrics:" "$VALUES_FILE"; then
    cat >> "$VALUES_FILE" <<EOF

# Metrics
metrics:
  enabled: true
  port: "metrics"
  path: "/metrics"
  interval: "30s"
  scrapeTimeout: "10s"
EOF
    echo "    Added metrics section"
  fi
  echo "  ✓ Added ServiceMonitor to $chart_name"
done
echo "ServiceMonitor addition complete!"
