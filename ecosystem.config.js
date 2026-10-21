// PM2 process file for the VPS (DEPLOY.md). Shipped inside every release and used by
// scripts/server/deploy.sh: pm2 startOrReload <release>/ecosystem.config.js --update-env
//
// The script path goes through the "current" symlink, so each reload starts a worker on
// whichever release deploy.sh has just switched "current" to.
const APP_DIR = '/www/wwwroot/dwaprice.com';

module.exports = {
  apps: [
    {
      name: 'dwaprice',
      cwd: APP_DIR,
      script: `${APP_DIR}/current/server.js`,
      // Cluster mode makes `pm2 reload` zero-downtime: the new worker is listening before
      // the old one is stopped. Keep a single instance: Next keeps revalidateTag state in
      // process memory, so a second worker would miss POST /api/revalidate calls.
      exec_mode: 'cluster',
      instances: 1,
      listen_timeout: 15_000,
      kill_timeout: 10_000,
      // Restart if the worker grows past this (raise it on a VPS with more than 2 GB RAM).
      max_memory_restart: '1G',
      // App settings and secrets come from shared/.env, which Next loads from the release.
      env: {
        NODE_ENV: 'production',
        // APP_PORT comes from scripts/server/deploy.sh; 3100 if PM2 is run with this file by hand.
        PORT: Number(process.env.APP_PORT) || 3100,
        HOSTNAME: '127.0.0.1',
      },
      out_file: `${APP_DIR}/shared/logs/out.log`,
      error_file: `${APP_DIR}/shared/logs/error.log`,
      merge_logs: true,
      time: true,
    },
  ],
};
