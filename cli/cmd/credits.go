package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"

	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
)

var creditsCmd = &cobra.Command{
	Use:   "credits",
	Short: "Manage your AskKaya credits",
	Long: `View your credit balance and purchase more credits.

Examples:
  askkaya credits balance    # View current credit balance
  askkaya credits buy        # Open browser to purchase credits`,
}

var balanceCmd = &cobra.Command{
	Use:   "balance",
	Short: "View your current credit balance",
	RunE:  runCreditsBalance,
}

var buyCmd = &cobra.Command{
	Use:   "buy",
	Short: "Purchase more credits",
	Long: `Open your browser to purchase credit packs.

Available packs:
  - Starter: 50 credits for $10 ($0.20/credit)
  - Standard: 100 credits for $18 ($0.18/credit)
  - Pro: 250 credits for $40 ($0.16/credit)`,
	RunE: runCreditsBuy,
}

func init() {
	creditsCmd.AddCommand(balanceCmd)
	creditsCmd.AddCommand(buyCmd)
}

func runCreditsBalance(cmd *cobra.Command, args []string) error {
	// Load tokens
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	// Get user's client ID
	effectiveClientID := tokens.ClientID
	if effectiveClientID == "" {
		effectiveClientID = clientID
	}
	if effectiveClientID == "" {
		return fmt.Errorf("no client ID found. Please run 'askkaya auth login' again")
	}

	// Fetch client data from API
	url := fmt.Sprintf("%s/meApi", apiBaseURL)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokens.IDToken))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch account info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to fetch account info: status %d", resp.StatusCode)
	}

	var accountInfo struct {
		ClientID string `json:"client_id"`
		Email    string `json:"email"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&accountInfo); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	// Now fetch client details from Firestore (through an API endpoint)
	// For now, show a simple message
	fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("Credit Balance")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("\nEmail: %s\n", accountInfo.Email)
	fmt.Println("\nTo view your detailed balance, visit:")
	fmt.Println("  https://askkaya.com/credits")
	fmt.Println("\nOr purchase more credits:")
	fmt.Println("  askkaya credits buy")
	fmt.Println()

	return nil
}

func runCreditsBuy(cmd *cobra.Command, args []string) error {
	// Load tokens to verify logged in
	keychain := auth.NewKeychain(keychainService)
	_, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	creditsURL := "https://askkaya.com/credits"

	fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("Purchase Credits")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("\nAvailable credit packs:")
	fmt.Println("  • Starter: 50 credits for $10 ($0.20/credit)")
	fmt.Println("  • Standard: 100 credits for $18 ($0.18/credit)")
	fmt.Println("  • Pro: 250 credits for $40 ($0.16/credit)")
	fmt.Println()
	fmt.Printf("Opening browser to: %s\n", creditsURL)
	fmt.Println()

	// Open browser
	if err := openBrowser(creditsURL); err != nil {
		fmt.Printf("Could not open browser automatically.\n")
		fmt.Printf("Please visit: %s\n\n", creditsURL)
		return nil
	}

	fmt.Println("✓ Browser opened successfully")
	fmt.Println()

	return nil
}

// openBrowser opens the specified URL in the default browser
func openBrowser(url string) error {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "linux":
		cmd = "xdg-open"
		args = []string{url}
	case "windows":
		cmd = "rundll32"
		args = []string{"url.dll,FileProtocolHandler", url}
	default:
		return fmt.Errorf("unsupported platform")
	}

	return exec.Command(cmd, args...).Start()
}
