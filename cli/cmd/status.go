package cmd

import (
	"fmt"
	"time"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Check authentication and API status",
	Long:  `Display the current authentication status and verify API connectivity.`,
	RunE:  runStatus,
}

func runStatus(cmd *cobra.Command, args []string) error {
	fmt.Println("AskKaya Status")
	fmt.Println("==============")
	fmt.Println()

	// Check authentication (auto-refreshes if expired)
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)

	if err != nil {
		// Try to load without refresh to show better error message
		rawTokens, loadErr := keychain.LoadTokens()
		if loadErr != nil {
			fmt.Println("Authentication: Not logged in")
			fmt.Println("  Run 'askkaya auth login' to authenticate")
		} else if time.Now().After(rawTokens.ExpiresAt) {
			fmt.Println("Authentication: Token expired (refresh failed)")
			fmt.Printf("  Error: %v\n", err)
			fmt.Println("  Run 'askkaya auth login' to re-authenticate")
		} else {
			fmt.Println("Authentication: Error")
			fmt.Printf("  %v\n", err)
		}
		return nil
	}

	fmt.Println("Authentication: Logged in")
	if tokens.Email != "" {
		fmt.Printf("  Email: %s\n", tokens.Email)
	}
	if tokens.Role != "" {
		fmt.Printf("  Role: %s\n", tokens.Role)
	}

	// Check token expiry
	if time.Now().After(tokens.ExpiresAt) {
		fmt.Println("  Token: Expired")
	} else {
		remaining := time.Until(tokens.ExpiresAt)
		fmt.Printf("  Token: Valid (expires in %s)\n", formatDuration(remaining))
	}

	// Check API connectivity if we have a token
	// Use stored client ID from tokens, fall back to env var
	effectiveClientID := tokens.ClientID
	if effectiveClientID == "" {
		effectiveClientID = clientID
	}

	if effectiveClientID != "" {
		fmt.Println()
		fmt.Println("API Status:")
		fmt.Printf("  Client ID: %s\n", effectiveClientID)
		fmt.Printf("  Base URL: %s\n", apiBaseURL)

		apiClient := api.NewClient(apiBaseURL, tokens.IDToken, effectiveClientID)
		if err := apiClient.HealthCheck(); err != nil {
			fmt.Printf("  Health: Unhealthy (%v)\n", err)
		} else {
			fmt.Println("  Health: OK")
		}
	} else {
		fmt.Println()
		fmt.Println("API Status: Skipped (no client ID found - try 'askkaya auth login')")
	}

	return nil
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%d seconds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%d minutes", int(d.Minutes()))
	}
	return fmt.Sprintf("%.1f hours", d.Hours())
}
