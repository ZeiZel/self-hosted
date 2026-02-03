#!/usr/bin/env bash
# Validation script for self-hosted platform
# Runs all quality checks before deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "========================================="
echo "Self-Hosted Platform Validation"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
WARN=0

pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASS++))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAIL++))
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARN++))
}

echo "1. Checking prerequisites..."
echo "----------------------------"

# Check required tools
for tool in ansible helm helmfile kubectl sops gpg yamllint; do
  if command -v $tool &> /dev/null; then
    pass "$tool installed"
  else
    fail "$tool not found"
  fi
done

echo ""
echo "2. Validating Ansible playbooks..."
echo "----------------------------------"

# Ansible syntax check
cd "$PROJECT_ROOT/ansible"
if ansible-playbook --syntax-check -i inventory/hosts.ini all.yml &> /dev/null; then
  pass "Ansible syntax check"
else
  fail "Ansible syntax check failed"
fi

# Ansible lint (if installed)
if command -v ansible-lint &> /dev/null; then
  if ansible-lint *.yml --quiet 2>&1 | grep -q "Passed"; then
    pass "Ansible lint"
  else
    warn "Ansible lint warnings (non-blocking)"
  fi
fi

echo ""
echo "3. Validating Helm charts..."
echo "----------------------------"

cd "$PROJECT_ROOT/kubernetes/charts"
for chart in */; do
  chart_name=$(basename "$chart")
  if helm lint "$chart" &> /dev/null; then
    pass "helm lint: $chart_name"
  else
    fail "helm lint: $chart_name"
  fi
done

echo ""
echo "4. Validating Kubernetes manifests..."
echo "--------------------------------------"

# Kubeval check (if installed)
if command -v kubeval &> /dev/null; then
  KUBEVAL_PASS=true
  for chart in */; do
    chart_name=$(basename "$chart")
    if ! helm template "$chart" 2>/dev/null | kubeval --strict --ignore-missing-schemas &> /dev/null; then
      fail "kubeval: $chart_name"
      KUBEVAL_PASS=false
    fi
  done
  if $KUBEVAL_PASS; then
    pass "kubeval validation (all charts)"
  fi
else
  warn "kubeval not installed (skipping K8s validation)"
fi

echo ""
echo "5. Checking for secrets leaks..."
echo "--------------------------------"

cd "$PROJECT_ROOT"

# Check for common secret patterns
SECRET_PATTERNS=(
  "password.*=.*['\"]"
  "secret.*=.*['\"]"
  "token.*=.*['\"]"
  "api[_-]?key.*=.*['\"]"
  "BEGIN.*PRIVATE.*KEY"
)

SECRETS_FOUND=false
for pattern in "${SECRET_PATTERNS[@]}"; do
  if git grep -iE "$pattern" -- '*.yaml' '*.yml' '*.sh' &> /dev/null; then
    fail "Possible secret exposed: $pattern"
    SECRETS_FOUND=true
  fi
done

if ! $SECRETS_FOUND; then
  pass "No secrets exposed in tracked files"
fi

echo ""
echo "6. Validating SOPS encryption..."
echo "---------------------------------"

cd "$PROJECT_ROOT/kubernetes/envs/k8s/secrets"
if [ -f "_all.yaml" ]; then
  if sops -d _all.yaml &> /dev/null; then
    pass "SOPS secrets can be decrypted"
  else
    fail "SOPS decryption failed (check GPG keys)"
  fi
else
  warn "No SOPS secrets file found"
fi

echo ""
echo "7. Checking compliance..."
echo "-------------------------"

cd "$PROJECT_ROOT/kubernetes/charts"

# Count charts with required templates
TOTAL_CHARTS=$(ls -1d */ | wc -l | tr -d ' ')
NP_COUNT=$(find . -name 'networkpolicy.yaml' -path '*/templates/*' | wc -l | tr -d ' ')
SA_COUNT=$(find . -name 'serviceaccount.yaml' -path '*/templates/*' | wc -l | tr -d ' ')
RBAC_COUNT=$(find . -name 'rbac.yaml' -path '*/templates/*' | wc -l | tr -d ' ')
SM_COUNT=$(find . -name 'servicemonitor.yaml' -path '*/templates/*' | wc -l | tr -d ' ')
PDB_COUNT=$(find . -name 'pdb.yaml' -path '*/templates/*' | wc -l | tr -d ' ')
TEST_COUNT=$(find . -name 'test-connection.yaml' -path '*/templates/tests/*' | wc -l | tr -d ' ')

if [ "$NP_COUNT" -eq "$TOTAL_CHARTS" ]; then
  pass "NetworkPolicy coverage: $NP_COUNT/$TOTAL_CHARTS (100%)"
else
  fail "NetworkPolicy coverage: $NP_COUNT/$TOTAL_CHARTS ($(($NP_COUNT * 100 / $TOTAL_CHARTS))%)"
fi

if [ "$SA_COUNT" -eq "$TOTAL_CHARTS" ]; then
  pass "ServiceAccount coverage: $SA_COUNT/$TOTAL_CHARTS (100%)"
else
  warn "ServiceAccount coverage: $SA_COUNT/$TOTAL_CHARTS ($(($SA_COUNT * 100 / $TOTAL_CHARTS))%)"
fi

if [ "$RBAC_COUNT" -eq "$TOTAL_CHARTS" ]; then
  pass "RBAC coverage: $RBAC_COUNT/$TOTAL_CHARTS (100%)"
else
  warn "RBAC coverage: $RBAC_COUNT/$TOTAL_CHARTS ($(($RBAC_COUNT * 100 / $TOTAL_CHARTS))%)"
fi

if [ "$SM_COUNT" -eq "$TOTAL_CHARTS" ]; then
  pass "ServiceMonitor coverage: $SM_COUNT/$TOTAL_CHARTS (100%)"
else
  warn "ServiceMonitor coverage: $SM_COUNT/$TOTAL_CHARTS ($(($SM_COUNT * 100 / $TOTAL_CHARTS))%)"
fi

if [ "$PDB_COUNT" -eq "$TOTAL_CHARTS" ]; then
  pass "PDB coverage: $PDB_COUNT/$TOTAL_CHARTS (100%)"
else
  warn "PDB coverage: $PDB_COUNT/$TOTAL_CHARTS ($(($PDB_COUNT * 100 / $TOTAL_CHARTS))%)"
fi

if [ "$TEST_COUNT" -eq "$TOTAL_CHARTS" ]; then
  pass "Helm Tests coverage: $TEST_COUNT/$TOTAL_CHARTS (100%)"
else
  fail "Helm Tests coverage: $TEST_COUNT/$TOTAL_CHARTS ($(($TEST_COUNT * 100 / $TOTAL_CHARTS))%)"
fi

echo ""
echo "========================================="
echo "Validation Summary"
echo "========================================="
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${YELLOW}Warnings: $WARN${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}Validation FAILED${NC}"
  echo "Fix errors before proceeding with deployment."
  exit 1
else
  echo -e "${GREEN}Validation PASSED${NC}"
  if [ $WARN -gt 0 ]; then
    echo "Review warnings before deploying to production."
  fi
  exit 0
fi
