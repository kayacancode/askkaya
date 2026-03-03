package cmd

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/askkaya/cli/internal/heartbeat"
	"github.com/spf13/cobra"
)

var (
	heartbeatInterval time.Duration
)

var heartbeatCmd = &cobra.Command{
	Use:   "heartbeat",
	Short: "Start background health monitoring",
	Long: `Start a background daemon that periodically checks API connectivity.

This is useful for keeping connections warm and detecting issues early.
The daemon will log warnings when it detects problems like network errors
or billing suspension.`,
	RunE: runHeartbeat,
}

func init() {
	heartbeatCmd.Flags().DurationVarP(&heartbeatInterval, "interval", "n", 30*time.Second, "Health check interval")
}

func runHeartbeat(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain (auto-refreshes if expired)
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	// Use stored client ID, or fall back to environment variable
	effectiveClientID := tokens.ClientID
	if effectiveClientID == "" {
		effectiveClientID = clientID
	}
	if effectiveClientID == "" {
		return fmt.Errorf("no client ID found. Please run 'askkaya auth login' again")
	}

	// Create API client
	apiClient := api.NewClient(apiBaseURL, tokens.IDToken, effectiveClientID)

	// Set up token refresh
	authClient := auth.NewClient(apiKey, "https://identitytoolkit.googleapis.com")
	authClient.SetTokens(*tokens)
	apiClient.SetTokenRefresher(authClient.GetCurrentToken)

	// Create health check function
	healthCheck := func() error {
		return apiClient.HealthCheck()
	}

	// Create daemon
	daemon := heartbeat.NewDaemon(healthCheck, heartbeatInterval)
	daemon.SetLogger(func(msg string) {
		log.Println(msg)
	})

	// Start daemon
	fmt.Printf("Starting heartbeat daemon (interval: %s)\n", heartbeatInterval)
	fmt.Println("Press Ctrl+C to stop")
	daemon.Start()

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nStopping heartbeat daemon...")
	daemon.Stop()
	fmt.Println("Goodbye!")

	return nil
}
