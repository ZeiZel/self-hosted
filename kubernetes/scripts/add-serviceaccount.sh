#!/usr/bin/env bash
# Script to add ServiceAccount template to all charts
# Usage: ./add-serviceaccount.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHARTS_DIR="$SCRIPT_DIR/../charts"
TEMPLATE_FILE="$SCRIPT_DIR/../.templates/serviceaccount.yaml"

# Charts that already have serviceaccount
SKIP_CHARTS="affine remnawave stoat"

echo "Adding ServiceAccount to charts..."

for chart_dir in "$CHARTS_DIR"/*; do
  if [ ! -d "$chart_dir" ]; then
    continue
  fi

  chart_name=$(basename "$chart_dir")

  # Skip charts that already have serviceaccount
  if [[ "$SKIP_CHARTS" =~ $chart_name ]]; then
    echo "  Skipping $chart_name (already has ServiceAccount)"
    continue
  fi

  # Skip if template already exists
  if [ -f "$chart_dir/templates/serviceaccount.yaml" ]; then
    echo "  Skipping $chart_name (serviceaccount.yaml already exists)"
    continue
  fi

  echo "  Processing $chart_name..."

  # Create templates directory if it doesn't exist
  mkdir -p "$chart_dir/templates"

  # Copy and modify template
  sed "s/CHARTNAME/$chart_name/g" "$TEMPLATE_FILE" > "$chart_dir/templates/serviceaccount.yaml"

  # Add serviceAccount section to values.yaml if it doesn't exist
  VALUES_FILE="$chart_dir/values.yaml"
  if [ -f "$VALUES_FILE" ]; then
    if ! grep -q "^serviceAccount:" "$VALUES_FILE"; then
      cat >> "$VALUES_FILE" <<EOF

# Service Account
serviceAccount:
  create: true
  automountServiceAccountToken: true
  annotations: {}
  name: ""
EOF
      echo "    Added serviceAccount section to values.yaml"
    fi
  fi

  echo "  ✓ Added ServiceAccount to $chart_name"
done

echo ""
echo "ServiceAccount addition complete!"
echo "Total charts processed: $(ls -1d $CHARTS_DIR/* | wc -l)"
