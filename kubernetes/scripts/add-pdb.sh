#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHARTS_DIR="$SCRIPT_DIR/../charts"
TEMPLATE_FILE="$SCRIPT_DIR/../.templates/pdb.yaml"
SKIP_CHARTS="vault"

echo "Adding PDB to charts..."
for chart_dir in "$CHARTS_DIR"/*; do
  [ ! -d "$chart_dir" ] && continue
  chart_name=$(basename "$chart_dir")
  [[ "$SKIP_CHARTS" =~ $chart_name ]] && echo "  Skipping $chart_name" && continue
  [ -f "$chart_dir/templates/pdb.yaml" ] && echo "  Skipping $chart_name (exists)" && continue

  echo "  Processing $chart_name..."
  mkdir -p "$chart_dir/templates"
  sed "s/CHARTNAME/$chart_name/g" "$TEMPLATE_FILE" > "$chart_dir/templates/pdb.yaml"

  VALUES_FILE="$chart_dir/values.yaml"
  if [ -f "$VALUES_FILE" ] && ! grep -q "^podDisruptionBudget:" "$VALUES_FILE"; then
    cat >> "$VALUES_FILE" <<EOF

# Pod Disruption Budget
podDisruptionBudget:
  enabled: false
  minAvailable: 1
  # maxUnavailable: 1
EOF
    echo "    Added podDisruptionBudget section"
  fi
  echo "  ✓ Added PDB to $chart_name"
done
echo "PDB addition complete!"
