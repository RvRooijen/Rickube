// poller.js - Real-time polling service

class PollerService {
  constructor() {
    this.intervals = new Map();
  }

  // Start polling with a callback
  start(key, callback, intervalMs) {
    // Stop existing poller if any
    this.stop(key);

    // Execute immediately
    callback().catch(err => {
      console.error(`Poller error for ${key}:`, err);
    });

    // Set up interval
    const intervalId = setInterval(() => {
      callback().catch(err => {
        console.error(`Poller error for ${key}:`, err);
      });
    }, intervalMs);

    this.intervals.set(key, intervalId);
  }

  // Stop polling
  stop(key) {
    const intervalId = this.intervals.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(key);
    }
  }

  // Stop all pollers
  stopAll() {
    this.intervals.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    this.intervals.clear();
  }

  // Check if a poller is running
  isRunning(key) {
    return this.intervals.has(key);
  }

  // Get all active poller keys
  getActivePollers() {
    return Array.from(this.intervals.keys());
  }
}

export default PollerService;
