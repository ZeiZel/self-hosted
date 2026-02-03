#!/usr/bin/env bash
# Script to add NetworkPolicy template to all charts
# Usage: ./add-networkpolicy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHARTS_DIR="$SCRIPT_DIR/../charts"
TEMPLATE_FILE="$SCRIPT_DIR/../.templates/networkpolicy.yaml"

# Charts that already have networkpolicy
SKIP_CHARTS="remnawave"

# Function to check if chart needs databases
needs_databases() {
  local chart=$1
  case "$chart" in
    affine|bytebase|coder|ghost|hub|stoat|supabase|teamcity|vaultwarden|youtrack|rybbit)
      echo "true"
      ;;
    *)
      echo "false"
      ;;
  esac
}

# Function to check if chart needs Authentik
needs_authentik() {
  local chart=$1
  case "$chart" in
    stoat|coder|ghost|remnawave)
      echo "true"
      ;;
    *)
      echo "false"
      ;;
  esac
}

echo "Adding NetworkPolicy to charts..."

for chart_dir in "$CHARTS_DIR"/*; do
  if [ ! -d "$chart_dir" ]; then
    continue
  fi

  chart_name=$(basename "$chart_dir")

  # Skip charts that already have networkpolicy
  if [[ "$SKIP_CHARTS" =~ $chart_name ]]; then
    echo "  Skipping $chart_name (already has NetworkPolicy)"
    continue
  fi

  # Skip if template already exists
  if [ -f "$chart_dir/templates/networkpolicy.yaml" ]; then
    echo "  Skipping $chart_name (networkpolicy.yaml already exists)"
    continue
  fi

  echo "  Processing $chart_name..."

  # Create templates directory if it doesn't exist
  mkdir -p "$chart_dir/templates"

  # Copy and modify template
  sed "s/CHARTNAME/$chart_name/g" "$TEMPLATE_FILE" > "$chart_dir/templates/networkpolicy.yaml"

  # Add networkPolicy section to values.yaml if it doesn't exist
  VALUES_FILE="$chart_dir/values.yaml"
  if [ -f "$VALUES_FILE" ]; then
    if ! grep -q "^networkPolicy:" "$VALUES_FILE"; then
      # Determine which services this chart needs
      needs_db=$(needs_databases "$chart_name")
      needs_consul="true"
      needs_vault="true"
      needs_authentik_sso=$(needs_authentik "$chart_name")

      cat >> "$VALUES_FILE" <<EOF

# Network Policy
networkPolicy:
  enabled: true
  egressRules:
    allowDatabases: $needs_db
    allowConsul: $needs_consul
    allowVault: $needs_vault
    allowAuthentik: $needs_authentik_sso
  ingress: []
  egress: []
EOF
      echo "    Added networkPolicy section to values.yaml"
    fi
  fi

  echo "  ✓ Added NetworkPolicy to $chart_name"
done

echo ""
echo "NetworkPolicy addition complete!"
echo "Total charts processed: $(ls -1d $CHARTS_DIR/* | wc -l)"
