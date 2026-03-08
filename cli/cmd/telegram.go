package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
)

var telegramCmd = &cobra.Command{
	Use:   "telegram",
	Short: "Manage Telegram bot integration",
	Long: `Link your AskKaya account to Telegram bot.

After linking, you can query AskKaya directly from Telegram!`,
}

var telegramLinkCmd = &cobra.Command{
	Use:   "link",
	Short: "Generate a code to link your Telegram account",
	Long: `Generate a one-time auth code to link your Telegram account to AskKaya.

Steps:
1. Run this command to get your auth code
2. Open Telegram and find the AskKaya bot
3. Send: /auth YOUR_CODE

The code expires in 5 minutes.`,
	RunE: runTelegramLink,
}

func init() {
	telegramCmd.AddCommand(telegramLinkCmd)
}

type telegramAuthResponse struct {
	Success   bool   `json:"success"`
	Code      string `json:"code"`
	Message   string `json:"message"`
	ExpiresIn int    `json:"expires_in"`
}

func runTelegramLink(cmd *cobra.Command, args []string) error {
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

	// Generate auth code
	url := apiBaseURL + "/telegramAuthApi"

	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+tokens.IDToken)
	req.Header.Set("X-Client-ID", effectiveClientID)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to generate auth code: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("failed to generate auth code (status %d)", resp.StatusCode)
	}

	var result telegramAuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("failed to generate auth code")
	}

	// Display instructions
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("🔗 Link Your Telegram Account")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
	fmt.Printf("Your auth code: %s\n", result.Code)
	fmt.Println()
	fmt.Println("Steps:")
	fmt.Println("1. Open Telegram")
	fmt.Println("2. Find the AskKaya bot (@AskKayaBot)")
	fmt.Println("3. Send this message:")
	fmt.Println()
	fmt.Printf("   /auth %s\n", result.Code)
	fmt.Println()
	fmt.Printf("⏱  Code expires in %d minutes\n", result.ExpiresIn/60)
	fmt.Println()

	return nil
}

func openBrowserToBot() error {
	botUsername := "AskKayaBot"
	url := fmt.Sprintf("https://t.me/%s", botUsername)
	return openBrowser(url)
}
