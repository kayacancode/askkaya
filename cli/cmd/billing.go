package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
)

var billingCmd = &cobra.Command{
	Use:   "billing",
	Short: "Billing and subscription commands",
	Long:  `Manage your AskKaya subscription and billing.`,
}

var billingStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Check your billing status",
	Long:  `Check your current subscription and billing status.`,
	RunE:  runBillingStatus,
}

var billingSetupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Set up or update your subscription",
	Long:  `Get a link to set up or update your subscription payment method.`,
	RunE:  runBillingSetup,
}

func init() {
	billingCmd.AddCommand(billingStatusCmd)
	billingCmd.AddCommand(billingSetupCmd)
	rootCmd.AddCommand(billingCmd)
}

type billingInfoResponse struct {
	BillingStatus string `json:"billing_status"`
	ClientID      string `json:"client_id"`
	Email         string `json:"email"`
}

func runBillingStatus(cmd *cobra.Command, args []string) error {
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	info, err := fetchBillingInfo(tokens.IDToken)
	if err != nil {
		return fmt.Errorf("failed to fetch billing info: %w", err)
	}

	fmt.Println()
	fmt.Println("Billing Status")
	fmt.Println("--------------")
	fmt.Printf("Status: %s\n", formatBillingStatus(info.BillingStatus))
	fmt.Println()

	switch info.BillingStatus {
	case "active":
		fmt.Println("✓ Your subscription is active. You can use AskKaya.")
	case "pending":
		fmt.Println("⚠️  Payment required to activate your subscription.")
		fmt.Println("   Run 'askkaya billing setup' to complete payment.")
	case "suspended":
		fmt.Println("⚠️  Your subscription has been suspended.")
		fmt.Println("   Please update your payment method.")
	case "cancelled":
		fmt.Println("Your subscription has been cancelled.")
		fmt.Println("   Run 'askkaya billing setup' to resubscribe.")
	}

	return nil
}

func formatBillingStatus(status string) string {
	switch status {
	case "active":
		return "Active ✓"
	case "pending":
		return "Pending Payment"
	case "suspended":
		return "Suspended"
	case "cancelled":
		return "Cancelled"
	default:
		return status
	}
}

func fetchBillingInfo(idToken string) (*billingInfoResponse, error) {
	url := apiBaseURL + "/meApi"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+idToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	var info billingInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}

	return &info, nil
}

type paymentLinkResponse struct {
	Success bool   `json:"success"`
	URL     string `json:"url,omitempty"`
	Error   string `json:"error,omitempty"`
}

func runBillingSetup(cmd *cobra.Command, args []string) error {
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	fmt.Println("Generating payment link...")

	result, err := requestPaymentLink(tokens.IDToken, tokens.ClientID)
	if err != nil {
		return fmt.Errorf("failed to generate payment link: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("could not generate payment link: %s", result.Error)
	}

	fmt.Println()
	fmt.Println("Opening payment page in your browser...")

	if err := openPaymentBrowser(result.URL); err != nil {
		fmt.Println()
		fmt.Println("Could not open browser. Please visit this URL:")
		fmt.Println(result.URL)
	}

	return nil
}

func requestPaymentLink(idToken, clientID string) (*paymentLinkResponse, error) {
	url := apiBaseURL + "/billingSetupApi"

	reqBody := fmt.Sprintf(`{"client_id":"%s"}`, clientID)

	req, err := http.NewRequest("POST", url, strings.NewReader(reqBody))
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

	var result paymentLinkResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

func openPaymentBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return fmt.Errorf("unsupported platform")
	}
	return cmd.Start()
}
