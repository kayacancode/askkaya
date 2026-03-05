package cmd

import (
	"fmt"
	"strings"
	"time"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
)

var (
	pendingOnly bool
)

var escalationsCmd = &cobra.Command{
	Use:   "escalations",
	Short: "View your escalated questions and answers",
	Long: `List escalations where Kaya responded personally.

When the automatic system can't answer with high confidence, your question
is escalated to Kaya who responds personally. You'll get an email when your
answer is ready, but you can also check here anytime.

Examples:
  askkaya escalations              # List all escalations
  askkaya escalations --pending    # Show only unanswered questions
  askkaya escalations view ID      # View a specific escalation`,
	RunE: runEscalations,
}

func init() {
	escalationsCmd.Flags().BoolVar(&pendingOnly, "pending", false, "Show only pending escalations")

	// Add subcommand for viewing specific escalation
	viewCmd := &cobra.Command{
		Use:   "view [escalation-id]",
		Short: "View a specific escalation",
		Args:  cobra.ExactArgs(1),
		RunE:  runViewEscalation,
	}
	escalationsCmd.AddCommand(viewCmd)
}

func runEscalations(cmd *cobra.Command, args []string) error {
	// Load tokens
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

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

	// Fetch escalations
	escalations, err := apiClient.GetEscalations(pendingOnly)
	if err != nil {
		return fmt.Errorf("failed to fetch escalations: %w", err)
	}

	if len(escalations) == 0 {
		if pendingOnly {
			fmt.Println("\nNo pending escalations.")
			fmt.Println("All your questions have been answered! 🎉")
		} else {
			fmt.Println("\nNo escalations yet.")
			fmt.Println("When the system can't answer with high confidence, Kaya will respond personally.")
		}
		return nil
	}

	// Display escalations
	fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("Your Escalations")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

	for i, esc := range escalations {
		if i > 0 {
			fmt.Println()
		}

		status := "⏳ Pending"
		if esc.Status == "answered" {
			status = "✅ Answered"
		} else if esc.Status == "dismissed" {
			status = "❌ Dismissed"
		}

		// Truncate ID for display
		shortID := esc.ID
		if len(shortID) > 8 {
			shortID = shortID[:8]
		}

		fmt.Printf("[%s] %s\n", shortID, status)

		// Truncate long questions
		question := esc.Query
		if len(question) > 70 {
			question = question[:67] + "..."
		}
		fmt.Printf("  Q: %s\n", question)

		if esc.Status == "answered" && esc.Answer != "" {
			// Truncate long answers
			answer := esc.Answer
			if len(answer) > 70 {
				answer = answer[:67] + "..."
			}
			fmt.Printf("  A: %s\n", answer)

			if esc.AnsweredAt != "" {
				answeredTime, err := time.Parse(time.RFC3339, esc.AnsweredAt)
				if err == nil {
					fmt.Printf("  Answered: %s\n", answeredTime.Format("Jan 2, 2006 3:04 PM"))
				}
			}
		} else if esc.Status == "pending" {
			createdTime, err := time.Parse(time.RFC3339, esc.CreatedAt)
			if err == nil {
				fmt.Printf("  Asked: %s\n", createdTime.Format("Jan 2, 2006 3:04 PM"))
			}
		}

		fmt.Printf("  View full: askkaya escalations view %s\n", shortID)
	}

	fmt.Println()
	return nil
}

func runViewEscalation(cmd *cobra.Command, args []string) error {
	escalationID := args[0]

	// Load tokens
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

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

	// Fetch specific escalation
	esc, err := apiClient.GetEscalation(escalationID)
	if err != nil {
		errStr := err.Error()
		if strings.Contains(errStr, "not found") || strings.Contains(errStr, "404") {
			return fmt.Errorf("escalation not found: %s", escalationID)
		}
		return fmt.Errorf("failed to fetch escalation: %w", err)
	}

	// Display
	fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("Escalation: %s\n", esc.ID)

	statusText := esc.Status
	switch esc.Status {
	case "pending":
		statusText = "⏳ Pending"
	case "answered":
		statusText = "✅ Answered"
	case "dismissed":
		statusText = "❌ Dismissed"
	}
	fmt.Printf("Status: %s\n", statusText)

	createdTime, err := time.Parse(time.RFC3339, esc.CreatedAt)
	if err == nil {
		fmt.Printf("Asked: %s\n", createdTime.Format("Jan 2, 2006 3:04 PM"))
	}

	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("\nQuestion:\n%s\n", esc.Query)

	if esc.Status == "answered" && esc.Answer != "" {
		fmt.Printf("\nAnswer:\n%s\n", esc.Answer)

		if esc.AnsweredAt != "" {
			answeredTime, err := time.Parse(time.RFC3339, esc.AnsweredAt)
			if err == nil {
				fmt.Printf("\nAnswered: %s\n", answeredTime.Format("Jan 2, 2006 3:04 PM"))
			}
		}
	} else if esc.Status == "pending" {
		fmt.Println("\n⏳ Kaya hasn't responded yet. You'll get an email when it's ready.")
	}

	fmt.Println()
	return nil
}
