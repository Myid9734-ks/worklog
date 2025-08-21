module.exports = {
  apps: [{
    name: "worklog",
    cwd: "/volume1/6TB/work_log_v1/server",
    script: "src/server.js",
    instances: 1,
    exec_mode: "fork",
    env: { NODE_ENV: "production" }
  }]
};
