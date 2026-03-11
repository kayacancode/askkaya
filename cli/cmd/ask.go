package cmd

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
)

var (
	askTarget          string
	askImagePath       string
	askIncludeTeam     bool
	askListTwins       bool
)

var askCmd = &cobra.Command{
	Use:   "ask [question]",
	Short: "Ask a question to a digital twin",
	Long: `Ask questions to digital twins in your organization.

Targets can be specified by name (slug) or with the --target flag:
  ask "What do you know about our API?"           # Uses default org twin
  ask kaya "How do model routing work?"           # Asks Kaya's twin
  ask team "What was decided in the last meeting?" # Asks team twin
  ask --target=justin "What's the deployment process?"

Special targets:
  - "team" or "my-team": Your team's shared knowledge
  - "org" or "organization": Organization-wide knowledge (default)

List available twins:
  ask --list

Examples:
  ask "How do I reset my password?"
  ask kaya "What's the status of the migration?"
  ask --target=engineering "What's our testing strategy?"
  ask "What's this error?" --image ./screenshot.png
  ask --list`,
	RunE: runAsk,
}

func init() {
	askCmd.Flags().StringVarP(&askTarget, "target", "t", "", "Target twin (name or ID)")
	askCmd.Flags().StringVarP(&askImagePath, "image", "i", "", "Path to image file (screenshot, error, etc.)")
	askCmd.Flags().BoolVar(&askIncludeTeam, "team-context", false, "Include team context in search")
	askCmd.Flags().BoolVarP(&askListTwins, "list", "l", false, "List available twins")
}

func runAsk(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	// Determine tenant ID
	tenantID := tokens.TenantID
	if tenantID == "" {
		// Fall back to client ID for backward compatibility
		tenantID = tokens.ClientID
	}

	// Create API client with tenant support
	apiClient := api.NewClientWithTenant(apiBaseURL, tokens.IDToken, tokens.ClientID, tenantID)

	// Set up token refresh
	authClient := auth.NewClient(apiKey, "https://identitytoolkit.googleapis.com")
	authClient.SetTokens(*tokens)
	apiClient.SetTokenRefresher(authClient.GetCurrentToken)

	// Handle --list flag
	if askListTwins {
		return listTwins(apiClient)
	}

	// Parse target and question from args
	target := askTarget
	var question string

	if len(args) == 0 {
		return fmt.Errorf("question required. Usage: ask \"your question\"\n\nOr list available twins: ask --list")
	}

	// Check if first arg looks like a target (no spaces, short)
	if len(args) >= 2 && !strings.Contains(args[0], " ") && len(args[0]) < 30 {
		// First arg is target, rest is question
		if target == "" {
			target = args[0]
		}
		question = strings.Join(args[1:], " ")
	} else {
		// All args are the question
		question = strings.Join(args, " ")
	}

	// Load image if provided
	var image *api.ImageInput
	if askImagePath != "" {
		imageData, mediaType, err := loadAskImage(askImagePath)
		if err != nil {
			return fmt.Errorf("failed to load image: %w", err)
		}
		image = &api.ImageInput{
			Data:      imageData,
			MediaType: mediaType,
		}
		fmt.Println("📷 Including screenshot in query...")
	}

	// Make the ask request
	response, err := apiClient.Ask(target, question, image, askIncludeTeam)
	if err != nil {
		errStr := err.Error()
		if strings.Contains(errStr, "not found") {
			fmt.Fprintln(os.Stderr, "")
			fmt.Fprintf(os.Stderr, "❌ Target not found: %s\n", target)
			fmt.Fprintln(os.Stderr, "")
			fmt.Fprintln(os.Stderr, "List available twins: ask --list")
			return nil
		}
		if strings.Contains(errStr, "access_denied") {
			fmt.Fprintln(os.Stderr, "")
			fmt.Fprintf(os.Stderr, "🔒 Access denied to target: %s\n", target)
			fmt.Fprintln(os.Stderr, "")
			fmt.Fprintln(os.Stderr, "You don't have permission to query this twin.")
			return nil
		}
		return fmt.Errorf("ask failed: %w", err)
	}

	// Print response
	fmt.Println()

	// Show which twin answered
	twinIcon := getTwinIcon(response.TargetTwin.Type)
	fmt.Printf("%s %s (%s)\n\n", twinIcon, response.TargetTwin.Name, response.TargetTwin.Type)

	// Print answer
	fmt.Println(response.Answer)
	fmt.Println()

	// Show confidence
	confidencePercent := int(response.Confidence * 100)
	fmt.Printf("Confidence: %d%%\n", confidencePercent)

	// Show sources
	if len(response.Sources) > 0 {
		fmt.Println("\nSources:")
		for _, source := range response.Sources {
			fmt.Printf("  - %s (%s)\n", source.Title, source.SourceType)
		}
	}

	// Note if escalated
	if response.Escalated {
		fmt.Println()
		if response.TargetTwin.Type == "person" {
			fmt.Printf("📬 %s has been notified and will get back to you!\n", response.TargetTwin.Name)
		} else {
			fmt.Println("📬 Your question has been escalated for human review.")
		}
	}

	return nil
}

// listTwins displays available twins
func listTwins(client *api.APIClient) error {
	twins, err := client.ListTwins()
	if err != nil {
		return fmt.Errorf("failed to list twins: %w", err)
	}

	if len(twins) == 0 {
		fmt.Println("No twins available.")
		fmt.Println("\nTwins are knowledge personas you can query.")
		return nil
	}

	fmt.Println("Available twins:")
	fmt.Println()

	// Group by type
	var orgTwins, teamTwins, personTwins []api.Twin
	for _, t := range twins {
		switch t.Type {
		case "organization":
			orgTwins = append(orgTwins, t)
		case "team":
			teamTwins = append(teamTwins, t)
		case "person":
			personTwins = append(personTwins, t)
		}
	}

	// Print organization twins
	if len(orgTwins) > 0 {
		fmt.Println("🏢 Organization")
		for _, t := range orgTwins {
			printTwin(t)
		}
		fmt.Println()
	}

	// Print team twins
	if len(teamTwins) > 0 {
		fmt.Println("👥 Teams")
		for _, t := range teamTwins {
			printTwin(t)
		}
		fmt.Println()
	}

	// Print person twins
	if len(personTwins) > 0 {
		fmt.Println("👤 People")
		for _, t := range personTwins {
			printTwin(t)
		}
		fmt.Println()
	}

	fmt.Println("Usage: ask [target] \"your question\"")
	fmt.Println("  e.g., ask kaya \"How does model routing work?\"")

	return nil
}


// printTwin prints a single twin entry
func printTwin(t api.Twin) {
	visibility := ""
	switch t.Visibility {
	case "private":
		visibility = " 🔒"
	case "team":
		visibility = " 👥"
	}

	expertise := ""
	if len(t.ExpertiseAreas) > 0 {
		expertise = fmt.Sprintf(" [%s]", strings.Join(t.ExpertiseAreas, ", "))
	}

	fmt.Printf("  %s%s%s\n", t.Slug, visibility, expertise)
}

// getTwinIcon returns an icon for a twin type
func getTwinIcon(twinType string) string {
	switch twinType {
	case "organization":
		return "🏢"
	case "team":
		return "👥"
	case "person":
		return "👤"
	default:
		return "🤖"
	}
}

// loadAskImage reads an image file and returns base64-encoded data and media type
func loadAskImage(path string) (string, string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", fmt.Errorf("failed to read file: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(path))
	var mediaType string
	switch ext {
	case ".jpg", ".jpeg":
		mediaType = "image/jpeg"
	case ".png":
		mediaType = "image/png"
	case ".gif":
		mediaType = "image/gif"
	case ".webp":
		mediaType = "image/webp"
	default:
		return "", "", fmt.Errorf("unsupported image format: %s (supported: jpg, png, gif, webp)", ext)
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return encoded, mediaType, nil
}
