#!/bin/sh
# Diagnostic script to check Vault volume permissions

LOG_FILE="/vault/.cursor/debug.log"

log_debug() {
  local hypothesis_id=$1
  local location=$2
  local message=$3
  local data=$4
  
  echo "{\"id\":\"log_$(date +%s)_$$\",\"timestamp\":$(date +%s)000,\"location\":\"$location\",\"message\":\"$message\",\"data\":$data,\"sessionId\":\"debug-session\",\"runId\":\"permission-check\",\"hypothesisId\":\"$hypothesis_id\"}" >> "$LOG_FILE"
}

# #region agent log
log_debug "A" "check-permissions.sh:entry" "Starting permission diagnostics" "{\"path\":\"/vault/data\",\"script\":\"check-permissions.sh\"}"
# #endregion

# Check current user
CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)
CURRENT_USER=$(id -un)

# #region agent log
log_debug "A" "check-permissions.sh:user" "Current container user info" "{\"uid\":$CURRENT_UID,\"gid\":$CURRENT_GID,\"user\":\"$CURRENT_USER\"}"
# #endregion

# Check if /vault/data exists
if [ -d "/vault/data" ]; then
  # #region agent log
  log_debug "B" "check-permissions.sh:dir-exists" "Directory exists" "{\"path\":\"/vault/data\",\"exists\":true}"
  # #endregion
  
  # Check directory permissions
  DIR_PERMS=$(stat -c "%a" /vault/data 2>/dev/null || stat -f "%OLp" /vault/data 2>/dev/null || echo "unknown")
  DIR_OWNER=$(stat -c "%U:%G" /vault/data 2>/dev/null || stat -f "%Su:%Sg" /vault/data 2>/dev/null || echo "unknown")
  DIR_UID=$(stat -c "%u" /vault/data 2>/dev/null || stat -f "%u" /vault/data 2>/dev/null || echo "unknown")
  DIR_GID=$(stat -c "%g" /vault/data 2>/dev/null || stat -f "%g" /vault/data 2>/dev/null || echo "unknown")
  
  # #region agent log
  log_debug "B" "check-permissions.sh:dir-perms" "Directory permissions" "{\"path\":\"/vault/data\",\"perms\":\"$DIR_PERMS\",\"owner\":\"$DIR_OWNER\",\"uid\":\"$DIR_UID\",\"gid\":\"$DIR_GID\"}"
  # #endregion
  
  # Check if writable
  if [ -w "/vault/data" ]; then
    # #region agent log
    log_debug "B" "check-permissions.sh:writable" "Directory is writable" "{\"path\":\"/vault/data\",\"writable\":true}"
    # #endregion
  else
    # #region agent log
    log_debug "B" "check-permissions.sh:not-writable" "Directory is NOT writable" "{\"path\":\"/vault/data\",\"writable\":false,\"current_uid\":$CURRENT_UID,\"dir_uid\":\"$DIR_UID\"}"
    # #endregion
  fi
  
  # Check for vault.db file
  if [ -f "/vault/data/vault.db" ]; then
    DB_PERMS=$(stat -c "%a" /vault/data/vault.db 2>/dev/null || stat -f "%OLp" /vault/data/vault.db 2>/dev/null || echo "unknown")
    DB_OWNER=$(stat -c "%U:%G" /vault/data/vault.db 2>/dev/null || stat -f "%Su:%Sg" /vault/data/vault.db 2>/dev/null || echo "unknown")
    
    # #region agent log
    log_debug "C" "check-permissions.sh:db-exists" "vault.db file exists" "{\"path\":\"/vault/data/vault.db\",\"perms\":\"$DB_PERMS\",\"owner\":\"$DB_OWNER\"}"
    # #endregion
  else
    # #region agent log
    log_debug "C" "check-permissions.sh:db-not-exists" "vault.db file does NOT exist" "{\"path\":\"/vault/data/vault.db\",\"will_create\":true}"
    # #endregion
  fi
else
  # #region agent log
  log_debug "B" "check-permissions.sh:dir-not-exists" "Directory does NOT exist" "{\"path\":\"/vault/data\",\"exists\":false}"
  # #endregion
fi

# Try to create a test file
TEST_FILE="/vault/data/.test_write_$$"
if touch "$TEST_FILE" 2>/dev/null; then
  rm -f "$TEST_FILE"
  # #region agent log
  log_debug "D" "check-permissions.sh:write-test-success" "Write test succeeded" "{\"test_file\":\"$TEST_FILE\",\"success\":true}"
  # #endregion
else
  WRITE_ERROR=$(touch "$TEST_FILE" 2>&1)
  # #region agent log
  log_debug "D" "check-permissions.sh:write-test-failed" "Write test failed" "{\"test_file\":\"$TEST_FILE\",\"success\":false,\"error\":\"$WRITE_ERROR\",\"current_uid\":$CURRENT_UID}"
  # #endregion
fi

# #region agent log
log_debug "A" "check-permissions.sh:exit" "Permission diagnostics completed" "{\"completed\":true}"
# #endregion

