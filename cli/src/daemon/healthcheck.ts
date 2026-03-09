/**
 * Simple healthcheck script for Docker HEALTHCHECK
 * Checks if the daemon process is responsive
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';

async function healthcheck() {
  const dataDir = process.env.DATA_DIR || join(homedir(), '.selfhost');
  const dbPath = join(dataDir, 'selfhost.db');

  try {
    // Check database connectivity
    const db = new Database(dbPath, { readonly: true });

    // Check if daemon is marked as running
    const result = db.query("SELECT value FROM daemon_state WHERE key = 'running'").get() as {
      value: string;
    } | null;

    db.close();

    if (result?.value !== 'true') {
      console.error('Daemon not marked as running');
      process.exit(1);
    }

    // Check last check timestamp
    const lastCheck = db.query("SELECT value FROM daemon_state WHERE key = 'last_check'").get() as {
      value: string;
    } | null;

    if (lastCheck) {
      const lastCheckTime = new Date(lastCheck.value);
      const now = new Date();
      const diffSeconds = (now.getTime() - lastCheckTime.getTime()) / 1000;

      // If last check was more than 5 minutes ago, consider unhealthy
      if (diffSeconds > 300) {
        console.error(`Last check was ${Math.round(diffSeconds)}s ago`);
        process.exit(1);
      }
    }

    console.log('Daemon is healthy');
    process.exit(0);
  } catch (error) {
    console.error('Healthcheck failed:', error);
    process.exit(1);
  }
}

healthcheck();
