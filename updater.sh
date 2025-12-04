#!/bin/bash

# updater.sh - System version checker and updater for SEER
# Location: /usr/local/sbin/updater.sh
# This script checks the repository for version updates and updates the system if needed

REPO_URL="https://github.com/lyncsolutionsph/seer_v1.0"
REPO_DIR="/opt/seer_v1.0"
TARGET_DIR="/home/admin"
DB_PATH="$TARGET_DIR/.node-red/seer.db"
LOG_FILE="/var/log/seer_updater.log"
LOCK_FILE="/tmp/seer_updater.lock"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Check if script is already running
if [ -f "$LOCK_FILE" ]; then
    log_message "Updater already running, exiting..."
    exit 0
fi

# Create lock file
touch "$LOCK_FILE"

# Trap to ensure lock file is removed on exit
trap "rm -f $LOCK_FILE" EXIT

log_message "Starting version check..."

# Get current version from database
CURRENT_VERSION=$(sqlite3 "$DB_PATH" "SELECT version FROM settings LIMIT 1;" 2>/dev/null)

if [ -z "$CURRENT_VERSION" ]; then
    log_message "ERROR: Could not read current version from database at $DB_PATH"
    exit 1
fi

log_message "Current version: $CURRENT_VERSION"

# Navigate to repo directory
cd "$REPO_DIR" || {
    log_message "ERROR: Could not navigate to $REPO_DIR"
    exit 1
}

# Fetch latest changes from repository
log_message "Fetching latest changes from repository..."
git fetch origin main 2>&1 >> "$LOG_FILE"

if [ $? -ne 0 ]; then
    log_message "ERROR: Failed to fetch from repository"
    exit 1
fi

# Get the version from the remote repository
REPO_VERSION=$(git show origin/main:version.txt 2>/dev/null | tr -d '[:space:]')

if [ -z "$REPO_VERSION" ]; then
    log_message "ERROR: Could not read version from repository"
    exit 1
fi

log_message "Repository version: $REPO_VERSION"

# Compare versions (using version comparison)
version_greater() {
    test "$(printf '%s\n' "$@" | sort -V | head -n 1)" != "$1"
}

# Check if repository version is higher
if version_greater "$CURRENT_VERSION" "$REPO_VERSION"; then
    log_message "New version available: $REPO_VERSION (current: $CURRENT_VERSION)"
    log_message "Starting update process..."
    
    # Stop Node-RED service
    log_message "Stopping Node-RED service..."
    sudo systemctl stop nodered
    
    if [ $? -ne 0 ]; then
        log_message "ERROR: Failed to stop Node-RED service"
        exit 1
    fi
    
    sleep 2
    
    # Backup current .node-red directory
    log_message "Backing up current .node-red directory..."
    BACKUP_DIR="$TARGET_DIR/.node-red.backup.$(date +%Y%m%d_%H%M%S)"
    cp -r "$TARGET_DIR/.node-red" "$BACKUP_DIR" 2>&1 >> "$LOG_FILE"
    
    if [ $? -eq 0 ]; then
        log_message "Backup created at $BACKUP_DIR"
    else
        log_message "WARNING: Backup failed, continuing anyway..."
    fi
    
    # Pull latest changes from repository
    log_message "Pulling latest changes..."
    git reset --hard origin/main 2>&1 >> "$LOG_FILE"
    
    if [ $? -ne 0 ]; then
        log_message "ERROR: Failed to pull latest changes"
        sudo systemctl start nodered
        exit 1
    fi
    
    # Copy/Move .node-red from repo to /home/admin/
    log_message "Copying .node-red from repository to $TARGET_DIR..."
    
    # Remove old .node-red except the database
    if [ -d "$TARGET_DIR/.node-red" ]; then
        # Preserve the database
        cp "$TARGET_DIR/.node-red/seer.db" /tmp/seer.db.tmp 2>/dev/null
        
        # Remove old .node-red
        rm -rf "$TARGET_DIR/.node-red"
    fi
    
    # Copy new .node-red from repo
    cp -r "$REPO_DIR/.node-red" "$TARGET_DIR/" 2>&1 >> "$LOG_FILE"
    
    if [ $? -ne 0 ]; then
        log_message "ERROR: Failed to copy .node-red directory"
        sudo systemctl start nodered
        exit 1
    fi
    
    # Restore the database
    if [ -f /tmp/seer.db.tmp ]; then
        mv /tmp/seer.db.tmp "$TARGET_DIR/.node-red/seer.db"
        log_message "Database restored"
    fi
    
    # Set proper permissions
    chown -R admin:admin "$TARGET_DIR/.node-red"
    log_message "Permissions set for .node-red"
    
    # Update database with new version
    log_message "Updating database version to $REPO_VERSION..."
    sqlite3 "$DB_PATH" "UPDATE settings SET version = '$REPO_VERSION', system_version = '$REPO_VERSION';" 2>&1 >> "$LOG_FILE"
    
    if [ $? -ne 0 ]; then
        log_message "ERROR: Failed to update database version"
        sudo systemctl start nodered
        exit 1
    fi
    
    # Verify the update
    NEW_VERSION=$(sqlite3 "$DB_PATH" "SELECT version FROM settings LIMIT 1;" 2>/dev/null)
    log_message "Database version updated to: $NEW_VERSION"
    
    # Start Node-RED service
    log_message "Starting Node-RED service..."
    sudo systemctl start nodered
    
    if [ $? -eq 0 ]; then
        log_message "Node-RED service started successfully"
    else
        log_message "ERROR: Failed to start Node-RED service"
        exit 1
    fi
    
    log_message "Update completed successfully to version $REPO_VERSION"
else
    log_message "System is up to date (version: $CURRENT_VERSION)"
    
    # Check if Node-RED is running, if not start it
    if ! systemctl is-active --quiet nodered; then
        log_message "Node-RED is not running, starting service..."
        sudo systemctl start nodered
    fi
fi

log_message "Version check completed."
