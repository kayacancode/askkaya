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
	linkClientID    string
	linkStripeID    string
	provisionEmail  string
	provisionName   string
	provisionActive bool
	setModelUserID   string
	setModelClientID string
	setModelModelID  string
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

var provisionCmd = &cobra.Command{
	Use:   "provision",
	Short: "Pre-provision an account for an existing customer",
	Long: `Create an AskKaya account for a pre-existing customer.

This creates their Firebase Auth account and client record so they can
immediately log in and use AskKaya without going through signup/billing.

Use --active to set billing_status to active (for existing paying customers).

Examples:
  askkaya admin provision -e customer@example.com --active
  askkaya admin provision -e customer@example.com -n "John Doe" --active`,
	RunE: runProvision,
}

var setModelCmd = &cobra.Command{
	Use:   "set-model",
	Short: "Assign a model to a user or client",
	Long: `Set which LLM model a user or client should use.

Users don't choose their own models - admins assign them.
If a user doesn't have an assigned model, they use their client's default.

Available models: claude-sonnet-4-5, gpt-4o-mini, qwen-2.5-72b, etc.

Examples:
  askkaya admin set-model --user USER_UID --model qwen-2.5-72b
  askkaya admin set-model --client CLIENT_ID --model claude-sonnet-4-5`,
	RunE: runSetModel,
}

func init() {
	linkStripeCmd.Flags().StringVarP(&linkClientID, "client-id", "c", "", "AskKaya client ID")
	linkStripeCmd.Flags().StringVarP(&linkStripeID, "stripe-id", "s", "", "Stripe customer ID (cus_XXX)")
	linkStripeCmd.MarkFlagRequired("client-id")
	linkStripeCmd.MarkFlagRequired("stripe-id")

	provisionCmd.Flags().StringVarP(&provisionEmail, "email", "e", "", "Customer email address")
	provisionCmd.Flags().StringVarP(&provisionName, "name", "n", "", "Customer name (optional, defaults to email prefix)")
	provisionCmd.Flags().BoolVar(&provisionActive, "active", false, "Set billing_status to active (for existing paying customers)")
	provisionCmd.MarkFlagRequired("email")

	setModelCmd.Flags().StringVar(&setModelUserID, "user", "", "User UID to assign model to")
	setModelCmd.Flags().StringVar(&setModelClientID, "client", "", "Client ID to set default model for")
	setModelCmd.Flags().StringVar(&setModelModelID, "model", "", "Model ID (e.g., claude-sonnet-4-5, qwen-2.5-72b)")
	setModelCmd.MarkFlagRequired("model")

	adminCmd.AddCommand(linkStripeCmd)
	adminCmd.AddCommand(provisionCmd)
	adminCmd.AddCommand(setModelCmd)
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

func runProvision(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadTokens()
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	// Validate email format
	if !strings.Contains(provisionEmail, "@") {
		return fmt.Errorf("invalid email format")
	}

	// Default name to email prefix
	name := provisionName
	if name == "" {
		name = strings.Split(provisionEmail, "@")[0]
	}

	billingStatus := "pending"
	if provisionActive {
		billingStatus = "active"
	}

	fmt.Printf("Provisioning account for %s...\n", provisionEmail)

	result, err := provisionAccount(tokens.IDToken, provisionEmail, name, billingStatus)
	if err != nil {
		return fmt.Errorf("failed to provision: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("failed: %s", result.Error)
	}

	fmt.Println("Successfully provisioned account!")
	fmt.Printf("  Email: %s\n", provisionEmail)
	fmt.Printf("  Name: %s\n", name)
	fmt.Printf("  Client ID: %s\n", result.ClientID)
	fmt.Printf("  Billing Status: %s\n", billingStatus)
	fmt.Println()
	fmt.Println("The customer can now log in with:")
	fmt.Printf("  askkaya auth login -e %s\n", provisionEmail)

	return nil
}

type provisionResponse struct {
	Success  bool   `json:"success"`
	ClientID string `json:"client_id,omitempty"`
	UserID   string `json:"user_id,omitempty"`
	Error    string `json:"error,omitempty"`
}

func provisionAccount(idToken, email, name, billingStatus string) (*provisionResponse, error) {
	url := apiBaseURL + "/provisionApi"

	body := map[string]string{
		"email":          email,
		"name":           name,
		"billing_status": billingStatus,
	}

	bodyBytes, _ := json.Marshal(body)

	req, err := http.NewRequest("POST", url, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+idToken)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result provisionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		if result.Error != "" {
			return &provisionResponse{Success: false, Error: result.Error}, nil
		}
		return &provisionResponse{Success: false, Error: fmt.Sprintf("server returned status %d", resp.StatusCode)}, nil
	}

	return &result, nil
}

func runSetModel(cmd *cobra.Command, args []string) error {
	// Validate that either user or client is specified
	if setModelUserID == "" && setModelClientID == "" {
		return fmt.Errorf("either --user or --client is required")
	}
	if setModelUserID != "" && setModelClientID != "" {
		return fmt.Errorf("only one of --user or --client can be specified")
	}

	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadTokens()
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	target := "user"
	targetID := setModelUserID
	if setModelClientID != "" {
		target = "client"
		targetID = setModelClientID
	}

	fmt.Printf("Setting model '%s' for %s %s...\n", setModelModelID, target, targetID)

	result, err := setModelForTarget(tokens.IDToken, setModelUserID, setModelClientID, setModelModelID)
	if err != nil {
		return fmt.Errorf("failed to set model: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("failed: %s", result.Error)
	}

	fmt.Println("Model assigned successfully!")
	return nil
}

type setModelResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

func setModelForTarget(idToken, userID, clientID, modelID string) (*setModelResponse, error) {
	url := apiBaseURL + "/adminSetModelApi"

	body := map[string]string{
		"model_id": modelID,
	}
	if userID != "" {
		body["user_id"] = userID
	}
	if clientID != "" {
		body["client_id"] = clientID
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

	var result setModelResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		if result.Error != "" {
			return &setModelResponse{Success: false, Error: result.Error}, nil
		}
		return &setModelResponse{Success: false, Error: fmt.Sprintf("server returned status %d", resp.StatusCode)}, nil
	}

	return &result, nil
}
