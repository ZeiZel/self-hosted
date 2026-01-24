#!/bin/bash
# Generates Helm index.yaml from GitHub Releases
set -e

REPO="${GITHUB_REPOSITORY}"
OUTPUT_DIR="${1:-./docs/build/charts}"
TEMP_DIR=$(mktemp -d)

mkdir -p "${OUTPUT_DIR}"

# Download all .tgz from releases
gh release list --repo "${REPO}" --limit 100 --json tagName,assets | \
  jq -r '.[] | .tagName as $tag | .assets[] | select(.name | endswith(".tgz")) | "\($tag) \(.name)"' | \
while read -r tag name; do
  echo "Downloading ${name} from ${tag}..."
  gh release download "${tag}" --repo "${REPO}" --pattern "${name}" --dir "${TEMP_DIR}" || true
done

# Generate index.yaml
if ls "${TEMP_DIR}"/*.tgz 1>/dev/null 2>&1; then
  helm repo index "${TEMP_DIR}" --url "https://github.com/${REPO}/releases/download"

  # Fix URLs (helm repo index creates relative paths)
  # Need to replace with direct links to release assets
  python3 << 'PYTHON'
import yaml
import sys
import os

repo = os.environ.get('GITHUB_REPOSITORY', 'ZeiZel/self-hosted')
base_url = f"https://github.com/{repo}/releases/download"

with open(sys.argv[1] if len(sys.argv) > 1 else 'index.yaml', 'r') as f:
    index = yaml.safe_load(f)

for chart_name, versions in index.get('entries', {}).items():
    for version in versions:
        # URL format: base_url/chart-version/chart-version.tgz
        chart_version = version.get('version', '')
        tgz_name = f"{chart_name}-{chart_version}.tgz"
        tag = f"{chart_name}-{chart_version}"
        version['urls'] = [f"{base_url}/{tag}/{tgz_name}"]

with open(sys.argv[1] if len(sys.argv) > 1 else 'index.yaml', 'w') as f:
    yaml.dump(index, f, default_flow_style=False)
PYTHON

  mv "${TEMP_DIR}/index.yaml" "${OUTPUT_DIR}/index.yaml"
  echo "Generated ${OUTPUT_DIR}/index.yaml"
else
  # Create empty index if no releases
  cat > "${OUTPUT_DIR}/index.yaml" << EOF
apiVersion: v1
entries: {}
generated: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EOF
  echo "Created empty index (no releases found)"
fi

rm -rf "${TEMP_DIR}"
