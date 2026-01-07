#!/bin/sh
# Entrypoint wrapper for Vault with permission diagnostics and fixes

LOG_FILE="/vault/.cursor/debug.log"

log_debug() {
  local hypothesis_id=$1
  local location=$2
  local message=$3
  local data=$4
  
  echo "{\"id\":\"log_$(date +%s)_$$\",\"timestamp\":$(date +%s)000,\"location\":\"$location\",\"message\":\"$message\",\"data\":$data,\"sessionId\":\"debug-session\",\"runId\":\"entrypoint\",\"hypothesisId\":\"$hypothesis_id\"}" >> "$LOG_FILE"
}

# #region agent log
log_debug "E" "entrypoint.sh:start" "Entrypoint script started" "{\"script\":\"entrypoint.sh\",\"args\":\"$@\"}"
# #endregion

# Run permission diagnostics
if [ -f "/vault/check-permissions.sh" ]; then
  # #region agent log
  log_debug "E" "entrypoint.sh:run-diagnostics" "Running permission diagnostics" "{\"script\":\"/vault/check-permissions.sh\"}"
  # #endregion
  sh /vault/check-permissions.sh
fi

# Get current user info
CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)

# #region agent log
log_debug "E" "entrypoint.sh:user-info" "Current user before permission fix" "{\"uid\":$CURRENT_UID,\"gid\":$CURRENT_GID}"
# #endregion

# Fix permissions for /vault/data if running as root
if [ "$CURRENT_UID" -eq 0 ]; then
  # #region agent log
  log_debug "E" "entrypoint.sh:fix-perms-root" "Running as root, fixing permissions" "{\"path\":\"/vault/data\"}"
  # #endregion
  
  # Create directories if they don't exist
  mkdir -p /vault/data /vault/logs /vault/file
  
  # Check if vault user exists and get its UID/GID
  if id vault >/dev/null 2>&1; then
    VAULT_UID=$(id -u vault)
    VAULT_GID=$(id -g vault)
    # #region agent log
    log_debug "E" "entrypoint.sh:vault-user-exists" "Vault user found" "{\"vault_uid\":$VAULT_UID,\"vault_gid\":$VAULT_GID}"
    # #endregion
    
    # Set ownership to vault user
    chown -R $VAULT_UID:$VAULT_GID /vault/data /vault/logs /vault/file 2>/dev/null || true
  else
    # #region agent log
    log_debug "E" "entrypoint.sh:no-vault-user" "Vault user not found, using permissive permissions" "{\"action\":\"chmod_777\"}"
    # #endregion
    # If vault user doesn't exist, make directories writable by all
    chmod -R 777 /vault/data /vault/logs /vault/file 2>/dev/null || true
  fi
  
  # Set permissions
  chmod -R 755 /vault/data /vault/logs /vault/file 2>/dev/null || true
  
  # #region agent log
  log_debug "E" "entrypoint.sh:perms-fixed" "Permissions fixed" "{\"path\":\"/vault/data\",\"action\":\"chown_and_chmod\"}"
  # #endregion
  
  # Try to switch to vault user if it exists and su-exec/gosu is available
  if id vault >/dev/null 2>&1; then
    if command -v su-exec >/dev/null 2>&1; then
      # #region agent log
      log_debug "E" "entrypoint.sh:switch-user-su-exec" "Switching to vault user using su-exec" "{\"target_user\":\"vault\"}"
      # #endregion
      exec su-exec vault "$@"
    elif command -v gosu >/dev/null 2>&1; then
      # #region agent log
      log_debug "E" "entrypoint.sh:switch-user-gosu" "Switching to vault user using gosu" "{\"target_user\":\"vault\"}"
      # #endregion
      exec gosu vault "$@"
    else
      # #region agent log
      log_debug "E" "entrypoint.sh:no-su-exec" "No su-exec/gosu found, running as root" "{\"warning\":\"running_as_root\"}"
      # #endregion
      exec "$@"
    fi
  else
    # #region agent log
    log_debug "E" "entrypoint.sh:no-vault-user-exec" "No vault user, running as root" "{\"warning\":\"running_as_root\"}"
    # #endregion
    exec "$@"
  fi
else
  # #region agent log
  log_debug "E" "entrypoint.sh:not-root" "Not running as root, proceeding with current user" "{\"uid\":$CURRENT_UID,\"gid\":$CURRENT_GID}"
  # #endregion
  exec "$@"
fi

