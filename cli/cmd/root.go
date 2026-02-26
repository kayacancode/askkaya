package cmd

import (
	"fmt"
	"os"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/askkaya/cli/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

var (
	// Configuration
	apiBaseURL string
	apiKey     string
	clientID   string

	// Firebase Web API Key (safe to include in client code)
	defaultAPIKey = "AIzaSyB73ewGKfrvzmYfM-YdAxhsWRslVxjv0ic"
)

var rootCmd = &cobra.Command{
	Use:   "askkaya",
	Short: "AskKaya - Client support platform CLI",
	Long: `AskKaya is a full-stack client support platform CLI.

Use this tool to query the support system with questions about your setup.
The system uses AI-powered RAG to provide accurate answers from your
organization's knowledge base.

Run without arguments to launch the interactive TUI.`,
	Version: "0.2.7",
	RunE:    runInteractive,
}

// Execute runs the root command
func Execute() error {
	return rootCmd.Execute()
}

// runInteractive launches the TUI when no subcommand is provided
func runInteractive(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadTokens()
	if err != nil {
		fmt.Println("Welcome to AskKaya!")
		fmt.Println()
		fmt.Println("To get started, log in first:")
		fmt.Println("  askkaya auth login")
		fmt.Println()
		fmt.Println("Don't have an account? Sign up with an invite code:")
		fmt.Println("  askkaya auth signup")
		return nil
	}

	// Use stored client ID
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

	// Launch TUI
	app := tui.NewAppWithAPI(tokens, &tuiAPIWrapper{apiClient})
	p := tea.NewProgram(app, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("TUI error: %w", err)
	}
	return nil
}

// tuiAPIWrapper wraps api.APIClient to implement tui.APIClient interface
type tuiAPIWrapper struct {
	client *api.APIClient
}

func (w *tuiAPIWrapper) Query(question string) (api.QueryResponse, error) {
	return w.client.Query(question)
}

func (w *tuiAPIWrapper) HealthCheck() error {
	return w.client.HealthCheck()
}

func init() {
	// Persistent flags available to all subcommands
	rootCmd.PersistentFlags().StringVar(&apiBaseURL, "api-url", getEnvOrDefault("ASKKAYA_API_URL", "https://us-central1-askkaya-47cef.cloudfunctions.net"), "API base URL")
	rootCmd.PersistentFlags().StringVar(&apiKey, "api-key", getEnvOrDefault("FIREBASE_API_KEY", defaultAPIKey), "Firebase API key")
	rootCmd.PersistentFlags().StringVar(&clientID, "client-id", os.Getenv("ASKKAYA_CLIENT_ID"), "Client ID")

	// Hide internal flags from help
	rootCmd.PersistentFlags().MarkHidden("api-key")
	rootCmd.PersistentFlags().MarkHidden("api-url")
	rootCmd.PersistentFlags().MarkHidden("client-id")

	// Add subcommands (visible to everyone)
	rootCmd.AddCommand(authCmd)
	rootCmd.AddCommand(queryCmd)
	rootCmd.AddCommand(statusCmd)

	// Admin-only commands - check role and conditionally hide
	rootCmd.AddCommand(heartbeatCmd)
	rootCmd.AddCommand(inviteCmd)

	// Hide admin commands if user is not an admin
	hideAdminCommandsIfNotAdmin()
}

// hideAdminCommandsIfNotAdmin checks the stored role and hides admin commands for non-admins
func hideAdminCommandsIfNotAdmin() {
	keychain := auth.NewKeychain("askkaya")
	tokens, err := keychain.LoadTokens()

	// If not logged in or role is not admin, hide admin commands
	if err != nil || tokens.Role != "admin" {
		adminCmd.Hidden = true
		heartbeatCmd.Hidden = true
		inviteCmd.Hidden = true
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// exitWithError prints an error and exits
func exitWithError(msg string, err error) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %s: %v\n", msg, err)
	} else {
		fmt.Fprintf(os.Stderr, "Error: %s\n", msg)
	}
	os.Exit(1)
}
