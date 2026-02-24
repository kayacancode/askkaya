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

Examples:
  askkaya invite generate                    # Generate 1 code
  askkaya invite generate -n 5               # Generate 5 codes
  askkaya invite generate -n 3 --max-uses 5  # 3 codes, each usable 5 times
  askkaya invite generate --expires 30       # Expires in 30 days`,
	RunE: runInviteGenerate,
}

func init() {
	inviteGenerateCmd.Flags().IntVarP(&inviteCount, "count", "n", 1, "Number of codes to generate")
	inviteGenerateCmd.Flags().IntVar(&inviteMaxUses, "max-uses", 1, "Maximum uses per code")
	inviteGenerateCmd.Flags().IntVar(&inviteExpiryDays, "expires", 0, "Days until expiration (0 = never)")
	inviteGenerateCmd.Flags().StringVar(&inviteNote, "note", "", "Note for the invite codes")

	inviteCmd.AddCommand(inviteGenerateCmd)
	rootCmd.AddCommand(inviteCmd)
}

func runInviteGenerate(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadTokens()
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	fmt.Printf("Generating %d invite code(s)...\n", inviteCount)

	result, err := generateInviteCodes(tokens.IDToken, inviteCount, inviteMaxUses, inviteExpiryDays, inviteNote)
	if err != nil {
		return fmt.Errorf("failed to generate invite codes: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("failed: %s", result.Error)
	}

	fmt.Println()
	fmt.Println("Generated invite codes:")
	fmt.Println("------------------------")
	for _, code := range result.Codes {
		fmt.Printf("  %s\n", code)
	}
	fmt.Println("------------------------")
	fmt.Printf("\nTotal: %d code(s)\n", len(result.Codes))

	if inviteMaxUses > 1 {
		fmt.Printf("Max uses per code: %d\n", inviteMaxUses)
	}
	if inviteExpiryDays > 0 {
		fmt.Printf("Expires in: %d days\n", inviteExpiryDays)
	}

	return nil
}

type generateInviteResponse struct {
	Success bool     `json:"success"`
	Codes   []string `json:"codes"`
	Count   int      `json:"count"`
	Error   string   `json:"error,omitempty"`
}

func generateInviteCodes(idToken string, count, maxUses, expiryDays int, note string) (*generateInviteResponse, error) {
	url := apiBaseURL + "/generateInviteApi"

	body := map[string]interface{}{
		"count":    count,
		"max_uses": maxUses,
	}
	if expiryDays > 0 {
		body["expires_in_days"] = expiryDays
	}
	if note != "" {
		body["note"] = note
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
