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

	// Check authentication
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadTokens()

	if err != nil {
		fmt.Println("Authentication: Not logged in")
		fmt.Println("  Run 'askkaya auth login' to authenticate")
		return nil
	}

	fmt.Println("Authentication: Logged in")

	// Check token expiry
	if time.Now().After(tokens.ExpiresAt) {
		fmt.Println("  Token: Expired")
	} else {
		remaining := time.Until(tokens.ExpiresAt)
		fmt.Printf("  Token: Valid (expires in %s)\n", formatDuration(remaining))
	}

	// Check API connectivity if we have a token
	if clientID != "" {
		fmt.Println()
		fmt.Println("API Status:")
		fmt.Printf("  Base URL: %s\n", apiBaseURL)

		apiClient := api.NewClient(apiBaseURL, tokens.IDToken, clientID)
		if err := apiClient.HealthCheck(); err != nil {
			fmt.Printf("  Health: Unhealthy (%v)\n", err)
		} else {
			fmt.Println("  Health: OK")
		}
	} else {
		fmt.Println()
		fmt.Println("API Status: Skipped (ASKKAYA_CLIENT_ID not set)")
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
