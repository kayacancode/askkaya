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
	linkClientID  string
	linkStripeID  string
)

var adminCmd = &cobra.Command{
	Use:   "admin",
	Short: "Admin commands (requires admin privileges)",
	Long:  `Administrative commands for managing clients, billing, and system configuration.`,
}

var linkStripeCmd = &cobra.Command{
	Use:   "link-stripe",
	Short: "Link a client to a Stripe customer",
	Long: `Link an existing AskKaya client to an existing Stripe customer.

This connects the client's billing to their Stripe subscription so that
payment status automatically syncs.

Examples:
  askkaya admin link-stripe --client-id ABC123 --stripe-id cus_XXX
  askkaya admin link-stripe -c ABC123 -s cus_XXX`,
	RunE: runLinkStripe,
}

func init() {
	linkStripeCmd.Flags().StringVarP(&linkClientID, "client-id", "c", "", "AskKaya client ID")
	linkStripeCmd.Flags().StringVarP(&linkStripeID, "stripe-id", "s", "", "Stripe customer ID (cus_XXX)")
	linkStripeCmd.MarkFlagRequired("client-id")
	linkStripeCmd.MarkFlagRequired("stripe-id")

	adminCmd.AddCommand(linkStripeCmd)
	rootCmd.AddCommand(adminCmd)
}

func runLinkStripe(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadTokens()
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	// Validate stripe ID format
	if !strings.HasPrefix(linkStripeID, "cus_") {
		return fmt.Errorf("invalid Stripe customer ID format. Should start with 'cus_'")
	}

	fmt.Printf("Linking client %s to Stripe customer %s...\n", linkClientID, linkStripeID)

	result, err := linkClientToStripe(tokens.IDToken, linkClientID, linkStripeID)
	if err != nil {
		return fmt.Errorf("failed to link: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("failed: %s", result.Error)
	}

	fmt.Println("Successfully linked client to Stripe customer!")
	fmt.Printf("  Client ID: %s\n", linkClientID)
	fmt.Printf("  Stripe ID: %s\n", linkStripeID)
	fmt.Printf("  Billing Status: %s\n", result.BillingStatus)

	return nil
}

type linkStripeResponse struct {
	Success       bool   `json:"success"`
	BillingStatus string `json:"billing_status,omitempty"`
	Error         string `json:"error,omitempty"`
}

func linkClientToStripe(idToken, clientID, stripeID string) (*linkStripeResponse, error) {
	url := apiBaseURL + "/linkStripeApi"

	body := map[string]string{
		"client_id":          clientID,
		"stripe_customer_id": stripeID,
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

	var result linkStripeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		if result.Error != "" {
			return &linkStripeResponse{Success: false, Error: result.Error}, nil
		}
		return &linkStripeResponse{Success: false, Error: fmt.Sprintf("server returned status %d", resp.StatusCode)}, nil
	}

	return &result, nil
}
