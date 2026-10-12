/*
 * VYRA engine configuration.
 * Keep this file free of secrets. This config is public in a browser.
 *
 * demoMode=true means no network request is sent and no real video is generated.
 * For real generation, deploy your own backend and set apiBaseUrl to its HTTPS URL.
 */
window.VYRA_ENGINE_CONFIG = {
  demoMode: true,
  apiBaseUrl: "",
  pollIntervalMs: 2500,
  maxPollAttempts: 240
};
