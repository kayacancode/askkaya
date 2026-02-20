package heartbeat

import (
	"strings"
	"fmt"

	"sync"
	"time"
)

// HealthCheckFunc is a function that performs a health check
type HealthCheckFunc func() error

// LoggerFunc is a function that logs messages
type LoggerFunc func(string)

// Daemon manages periodic health checks
type Daemon struct {
	healthCheck HealthCheckFunc
	interval    time.Duration
	logger      LoggerFunc
	stopChan    chan struct{}
	running     bool
	mu          sync.Mutex
}

const defaultInterval = 30 * time.Second

// NewDaemon creates a new heartbeat daemon
func NewDaemon(healthCheck HealthCheckFunc, interval time.Duration) *Daemon {
	if interval <= 0 {
		interval = defaultInterval
	}

	return &Daemon{
		healthCheck: healthCheck,
		interval:    interval,
		stopChan:    make(chan struct{}),
	}
}

// SetLogger sets the logger function
func (d *Daemon) SetLogger(logger LoggerFunc) {
	d.logger = logger
}

// GetInterval returns the configured interval
func (d *Daemon) GetInterval() time.Duration {
	return d.interval
}

// Start begins periodic health checks
func (d *Daemon) Start() {
	d.mu.Lock()
	defer d.mu.Unlock()

	// Don't start if already running
	if d.running {
		return
	}

	d.running = true
	d.stopChan = make(chan struct{})

	go d.run()
}

// Stop stops the periodic health checks
func (d *Daemon) Stop() {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.running {
		return
	}

	d.running = false
	close(d.stopChan)
}

// run is the main loop that performs health checks
func (d *Daemon) run() {
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()

	for {
		select {
		case <-d.stopChan:
			return
		case <-ticker.C:
			d.performHealthCheck()
		}
	}
}

// performHealthCheck executes a single health check
func (d *Daemon) performHealthCheck() {
	err := d.healthCheck()
	if err != nil {
		d.logWarning(err.Error())
	}
}

// logWarning logs a warning message
func (d *Daemon) logWarning(msg string) {
	if d.logger == nil {
		return
	}

	// Format the warning message
	var warning string
	
	// Handle specific error types
	if strings.Contains(msg, "auth token expired") {
		warning = "warning: auth token expired"
	} else if strings.Contains(msg, "billing suspended") {
		warning = "warning: billing suspended"
	} else if strings.Contains(msg, "network error") {
		warning = fmt.Sprintf("warning: %s", msg)
	} else {
		warning = fmt.Sprintf("warning: %s", msg)
	}

	d.logger(warning)
}
