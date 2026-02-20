package heartbeat_test

import (
	"errors"
	"testing"
	"time"

	"github.com/askkaya/cli/internal/heartbeat"
)

func TestDaemon_Start_BeginsPeriodicHealthChecks(t *testing.T) {
	checkCount := 0
	mockHealthCheck := func() error {
		checkCount++
		return nil
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 50*time.Millisecond)
	daemon.Start()

	// Wait for multiple health checks
	time.Sleep(150 * time.Millisecond)
	daemon.Stop()

	if checkCount < 2 {
		t.Errorf("Expected at least 2 health checks, got %d", checkCount)
	}
}

func TestDaemon_Stop_StopsTheLoop(t *testing.T) {
	checkCount := 0
	mockHealthCheck := func() error {
		checkCount++
		return nil
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 50*time.Millisecond)
	daemon.Start()

	time.Sleep(100 * time.Millisecond)
	daemon.Stop()

	countAfterStop := checkCount
	
	// Wait and verify no more checks happen
	time.Sleep(150 * time.Millisecond)

	if checkCount > countAfterStop+1 {
		t.Errorf("Health checks continued after Stop(), before: %d, after: %d", countAfterStop, checkCount)
	}
}

func TestDaemon_DetectsExpiredAuthToken(t *testing.T) {
	var loggedWarning string
	mockLogger := func(msg string) {
		loggedWarning = msg
	}

	mockHealthCheck := func() error {
		return errors.New("auth token expired")
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 50*time.Millisecond)
	daemon.SetLogger(mockLogger)
	daemon.Start()

	time.Sleep(100 * time.Millisecond)
	daemon.Stop()

	if loggedWarning == "" {
		t.Fatal("Expected warning to be logged for expired token")
	}

	if loggedWarning != "warning: auth token expired" {
		t.Errorf("Expected 'warning: auth token expired', got '%s'", loggedWarning)
	}
}

func TestDaemon_DetectsSuspendedBilling(t *testing.T) {
	var loggedWarning string
	mockLogger := func(msg string) {
		loggedWarning = msg
	}

	mockHealthCheck := func() error {
		return errors.New("billing suspended")
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 50*time.Millisecond)
	daemon.SetLogger(mockLogger)
	daemon.Start()

	time.Sleep(100 * time.Millisecond)
	daemon.Stop()

	if loggedWarning == "" {
		t.Fatal("Expected warning to be logged for billing suspension")
	}

	if loggedWarning != "warning: billing suspended" {
		t.Errorf("Expected 'warning: billing suspended', got '%s'", loggedWarning)
	}
}

func TestDaemon_SuccessfulHealthCheck_NoWarning(t *testing.T) {
	var loggedWarning string
	mockLogger := func(msg string) {
		loggedWarning = msg
	}

	mockHealthCheck := func() error {
		return nil
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 50*time.Millisecond)
	daemon.SetLogger(mockLogger)
	daemon.Start()

	time.Sleep(100 * time.Millisecond)
	daemon.Stop()

	if loggedWarning != "" {
		t.Errorf("Expected no warning for successful health check, got '%s'", loggedWarning)
	}
}

func TestDaemon_DefaultInterval(t *testing.T) {
	mockHealthCheck := func() error {
		return nil
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 0)
	
	interval := daemon.GetInterval()
	expectedInterval := 30 * time.Second
	
	if interval != expectedInterval {
		t.Errorf("Expected default interval %v, got %v", expectedInterval, interval)
	}
}

func TestDaemon_CustomInterval(t *testing.T) {
	mockHealthCheck := func() error {
		return nil
	}

	customInterval := 5 * time.Second
	daemon := heartbeat.NewDaemon(mockHealthCheck, customInterval)
	
	interval := daemon.GetInterval()
	
	if interval != customInterval {
		t.Errorf("Expected custom interval %v, got %v", customInterval, interval)
	}
}

func TestDaemon_MultipleStartCalls_DoesNotDuplicate(t *testing.T) {
	checkCount := 0
	mockHealthCheck := func() error {
		checkCount++
		return nil
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 50*time.Millisecond)
	daemon.Start()
	daemon.Start() // Second start should be ignored
	daemon.Start() // Third start should be ignored

	time.Sleep(100 * time.Millisecond)
	daemon.Stop()

	// Should have roughly 2 checks (100ms / 50ms), not 6 (which would indicate 3 loops)
	if checkCount > 4 {
		t.Errorf("Multiple Start() calls created duplicate loops, got %d checks", checkCount)
	}
}

func TestDaemon_StopBeforeStart_DoesNotPanic(t *testing.T) {
	mockHealthCheck := func() error {
		return nil
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 50*time.Millisecond)
	
	// Should not panic
	daemon.Stop()
}

func TestDaemon_NetworkError_LogsWarning(t *testing.T) {
	var loggedWarning string
	mockLogger := func(msg string) {
		loggedWarning = msg
	}

	mockHealthCheck := func() error {
		return errors.New("network error: connection refused")
	}

	daemon := heartbeat.NewDaemon(mockHealthCheck, 50*time.Millisecond)
	daemon.SetLogger(mockLogger)
	daemon.Start()

	time.Sleep(100 * time.Millisecond)
	daemon.Stop()

	if loggedWarning == "" {
		t.Fatal("Expected warning to be logged for network error")
	}

	if loggedWarning != "warning: network error: connection refused" {
		t.Errorf("Expected network error warning, got '%s'", loggedWarning)
	}
}
