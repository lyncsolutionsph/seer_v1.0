# SEER System Auto-Updater Setup Instructions

## Overview
This setup creates an automated system updater that checks for version updates every minute from the GitHub repository.

## Files in Repository

1. **version.txt** - Contains the current repository version (1.1)
2. **update_version.sql** - SQL script to update the database version to 1.1

## System File

- **updater.sh** - A reference copy is in the repo. Deploy it to `/usr/local/sbin/updater.sh` on the system.

## Installation Steps

### 1. Update Database Version (First Time Setup)

Run this command to update your database to version 1.1:

```bash
sqlite3 /opt/seer_v1.0/.node-red/seer.db < /opt/seer_v1.0/update_version.sql
```

Or manually:

```bash
sqlite3 /opt/seer_v1.0/.node-red/seer.db "UPDATE settings SET version = '1.1', system_version = '1.1';"
```

### 2. Deploy Updater Script

Copy the updater script from the repo to the system location:

```bash
# Copy updater script to system location
sudo cp /opt/seer_v1.0/updater.sh /usr/local/sbin/updater.sh

# Make it executable
sudo chmod +x /usr/local/sbin/updater.sh

# Create log directory and file
sudo mkdir -p /var/log
sudo touch /var/log/seer_updater.log
sudo chmod 666 /var/log/seer_updater.log
```

### 3. Setup Cron Job

Add the cron job to run every minute:

```bash
# Edit root's crontab
sudo crontab -e
```

Add this line:

```cron
* * * * * /usr/local/sbin/updater.sh
```

Or use this one-liner to add it:

```bash
(sudo crontab -l 2>/dev/null; echo "* * * * * /usr/local/sbin/updater.sh") | sudo crontab -
```

### 4. Verify Cron Job

Check that the cron job was added:

```bash
sudo crontab -l
```

## How It Works

1. **Every minute**, the cron job runs `updater.sh`
2. The script checks the current version from the SQLite database at `/home/admin/.node-red/seer.db`
3. It fetches the latest version from the GitHub repository's `version.txt`
4. If the repository version is higher:
   - Stops Node-RED service
   - Backs up the current `.node-red` directory
   - Pulls latest changes from GitHub to `/opt/seer_v1.0`
   - Copies/overwrites `.node-red` from repo to `/home/admin/` (preserves database)
   - Updates the database `version` and `system_version` columns
   - Starts Node-RED service
5. If versions match, it ensures Node-RED is running

## Version Update Workflow

To release a new version:

1. Update `version.txt` in the repository (e.g., change to 1.2)
2. Commit and push your changes to GitHub
3. The updater will automatically detect and install the update within 1 minute

## Logs

Check updater logs:

```bash
tail -f /var/log/seer_updater.log
```

## Important Notes

- The `.node-red` folder from the repo is copied to `/home/admin/.node-red` during updates
- Database (`seer.db`) is preserved during updates - not overwritten
- `.node-red` directory is automatically backed up before each update
- System does NOT reboot - only stops/starts Node-RED service
- Lock file prevents multiple simultaneous updates
- Script runs as root (via sudo in crontab) to manage services
- Permissions are set to `admin:admin` after copying files

## Troubleshooting

If updates are not working:

1. Check cron is running: `sudo systemctl status cron`
2. Check logs: `tail -100 /var/log/seer_updater.log`
3. Verify script permissions: `ls -l /usr/local/sbin/updater.sh`
4. Test script manually: `sudo /usr/local/sbin/updater.sh`
5. Check database: `sqlite3 /opt/seer_v1.0/.node-red/seer.db "SELECT * FROM settings;"`
