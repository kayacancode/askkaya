package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/askkaya/cli/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

var (
	interactive bool
)

var queryCmd = &cobra.Command{
	Use:   "query [question]",
	Short: "Ask a support question",
	Long: `Query the AskKaya knowledge base with your question.

The system uses AI-powered retrieval to find relevant information
from your organization's documentation and provide helpful answers.

Examples:
  askkaya query "How do I reset my password?"
  askkaya query -i  # Interactive mode`,
	RunE: runQuery,
}

func init() {
	queryCmd.Flags().BoolVarP(&interactive, "interactive", "i", false, "Launch interactive TUI mode")
}

func runQuery(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadTokens()
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	// Check client ID
	if clientID == "" {
		return fmt.Errorf("ASKKAYA_CLIENT_ID environment variable is required")
	}

	// Create API client
	apiClient := api.NewClient(apiBaseURL, tokens.IDToken, clientID)

	// Set up token refresh
	authClient := auth.NewClient(apiKey, "https://identitytoolkit.googleapis.com")
	authClient.SetTokens(*tokens)
	apiClient.SetTokenRefresher(authClient.GetCurrentToken)

	// Interactive mode
	if interactive {
		app := tui.NewAppWithAPI(tokens, &apiClientWrapper{apiClient})
		p := tea.NewProgram(app, tea.WithAltScreen())
		if _, err := p.Run(); err != nil {
			return fmt.Errorf("TUI error: %w", err)
		}
		return nil
	}

	// Single query mode
	if len(args) == 0 {
		return fmt.Errorf("question required. Usage: askkaya query \"your question\"")
	}

	question := strings.Join(args, " ")

	response, err := apiClient.Query(question)
	if err != nil {
		if strings.Contains(err.Error(), "billing suspended") {
			fmt.Fprintln(os.Stderr, "Your account has been suspended. Please contact support.")
			return nil
		}
		return fmt.Errorf("query failed: %w", err)
	}

	// Print response
	fmt.Println()
	fmt.Println(response.Text)
	fmt.Println()

	// Show confidence
	confidencePercent := int(response.Confidence * 100)
	fmt.Printf("Confidence: %d%%\n", confidencePercent)

	// Show sources
	if len(response.Sources) > 0 {
		fmt.Println("\nSources:")
		for _, source := range response.Sources {
			fmt.Printf("  - %s\n", source)
		}
	}

	// Note if escalated
	if response.Escalated {
		fmt.Println("\nNote: This question has been escalated for human review.")
	}

	return nil
}

// apiClientWrapper wraps api.APIClient to implement tui.APIClient interface
type apiClientWrapper struct {
	client *api.APIClient
}

func (w *apiClientWrapper) Query(question string) (api.QueryResponse, error) {
	return w.client.Query(question)
}

func (w *apiClientWrapper) HealthCheck() error {
	return w.client.HealthCheck()
}
