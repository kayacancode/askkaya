package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
)

var (
	inviteCount      int
	inviteMaxUses    int
	inviteExpiryDays int
	inviteNote       string
	inviteClientType string
	inviteTrialCredits int
)

var inviteCmd = &cobra.Command{
	Use:   "invite",
	Short: "Manage invite codes (admin)",
	Long:  `Generate and manage invite codes. Requires authentication.`,
}

var inviteGenerateCmd = &cobra.Command{
	Use:   "generate",
	Short: "Generate new invite codes",
	Long: `Generate one or more invite codes for new users.

Client Types:
  retainer       - Subscription-based (unlimited queries, requires payment)
  pay_per_query  - Credit-based (trial credits, pay as you go)

Examples:
  # Retainer client (subscription)
  askkaya invite generate --type retainer

  # Pay-per-query client with trial credits
  askkaya invite generate --type pay_per_query --trial-credits 10

  # Multiple codes
  askkaya invite generate -n 5 --type pay_per_query

  # With expiration
  askkaya invite generate --type retainer --expires 30`,
	RunE: runInviteGenerate,
}

func init() {
	inviteGenerateCmd.Flags().IntVarP(&inviteCount, "count", "n", 1, "Number of codes to generate")
	inviteGenerateCmd.Flags().IntVar(&inviteMaxUses, "max-uses", 1, "Maximum uses per code")
	inviteGenerateCmd.Flags().IntVar(&inviteExpiryDays, "expires", 0, "Days until expiration (0 = never)")
	inviteGenerateCmd.Flags().StringVar(&inviteNote, "note", "", "Note for the invite codes")
	inviteGenerateCmd.Flags().StringVar(&inviteClientType, "type", "retainer", "Client type (retainer or pay_per_query)")
	inviteGenerateCmd.Flags().IntVar(&inviteTrialCredits, "trial-credits", 10, "Trial credits for pay_per_query clients")

	inviteCmd.AddCommand(inviteGenerateCmd)
	// Note: inviteCmd is added to rootCmd in root.go (admin-only)
}

func runInviteGenerate(cmd *cobra.Command, args []string) error {
	// Validate client type
	if inviteClientType != "retainer" && inviteClientType != "pay_per_query" {
		return fmt.Errorf("invalid client type: %s (must be 'retainer' or 'pay_per_query')", inviteClientType)
	}

	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	fmt.Printf("Generating %d invite code(s) for %s clients...\n", inviteCount, inviteClientType)

	result, err := generateInviteCodes(
		tokens.IDToken,
		inviteCount,
		inviteMaxUses,
		inviteExpiryDays,
		inviteNote,
		inviteClientType,
		inviteTrialCredits,
	)
	if err != nil {
		return fmt.Errorf("failed to generate invite codes: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("failed: %s", result.Error)
	}

	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("Generated Invite Codes")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	for _, code := range result.Codes {
		fmt.Printf("  %s\n", code)
	}
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("\nTotal: %d code(s)\n", len(result.Codes))
	fmt.Printf("Client Type: %s\n", result.ClientType)

	if result.ClientType == "pay_per_query" && result.TrialCredits > 0 {
		fmt.Printf("Trial Credits: %d\n", result.TrialCredits)
	}
	if inviteMaxUses > 1 {
		fmt.Printf("Max uses per code: %d\n", inviteMaxUses)
	}
	if inviteExpiryDays > 0 {
		fmt.Printf("Expires in: %d days\n", inviteExpiryDays)
	}
	fmt.Println()

	return nil
}

type generateInviteResponse struct {
	Success      bool     `json:"success"`
	Codes        []string `json:"codes"`
	Count        int      `json:"count"`
	ClientType   string   `json:"client_type"`
	TrialCredits int      `json:"trial_credits,omitempty"`
	Error        string   `json:"error,omitempty"`
}

func generateInviteCodes(idToken string, count, maxUses, expiryDays int, note, clientType string, trialCredits int) (*generateInviteResponse, error) {
	url := apiBaseURL + "/generateInviteApi"

	body := map[string]interface{}{
		"count":       count,
		"max_uses":    maxUses,
		"client_type": clientType,
	}
	if expiryDays > 0 {
		body["expires_in_days"] = expiryDays
	}
	if note != "" {
		body["note"] = note
	}
	if clientType == "pay_per_query" {
		body["trial_credits"] = trialCredits
	}

	bodyBytes, _ := json.Marshal(body)

	req, err := http.NewRequest("POST", url, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+idToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result generateInviteResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		if result.Error != "" {
			return &generateInviteResponse{Success: false, Error: result.Error}, nil
		}
		return &generateInviteResponse{Success: false, Error: fmt.Sprintf("server returned status %d", resp.StatusCode)}, nil
	}

	return &result, nil
}
