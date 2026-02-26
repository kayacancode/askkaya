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
	apiKeyValue string
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Configure AskKaya settings",
	Long:  `Configure your AskKaya account settings, including API keys.`,
}

var setApiKeyCmd = &cobra.Command{
	Use:   "set-api-key",
	Short: "Set your Anthropic API key",
	Long: `Set your own Anthropic API key to use AskKaya with your own credits.

Get your API key from: https://console.anthropic.com/settings/keys

Examples:
  askkaya config set-api-key sk-ant-api03-xxx
  askkaya config set-api-key --key sk-ant-api03-xxx`,
	RunE: runSetApiKey,
}

func init() {
	setApiKeyCmd.Flags().StringVarP(&apiKeyValue, "key", "k", "", "Anthropic API key (sk-ant-...)")

	configCmd.AddCommand(setApiKeyCmd)
	rootCmd.AddCommand(configCmd)
}

func runSetApiKey(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadTokens()
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	// Get API key from flag or args
	key := apiKeyValue
	if key == "" && len(args) > 0 {
		key = args[0]
	}

	if key == "" {
		return fmt.Errorf("API key required. Usage: askkaya config set-api-key YOUR_KEY")
	}

	// Validate format
	if !strings.HasPrefix(key, "sk-ant-") {
		return fmt.Errorf("invalid API key format. Anthropic keys start with 'sk-ant-'")
	}

	fmt.Println("Setting Anthropic API key...")

	result, err := setApiKey(tokens.IDToken, key)
	if err != nil {
		return fmt.Errorf("failed to set API key: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("failed: %s", result.Error)
	}

	fmt.Println("API key saved successfully!")
	fmt.Println("You can now use AskKaya with your own Anthropic credits.")

	return nil
}

type setApiKeyResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

func setApiKey(idToken, apiKey string) (*setApiKeyResponse, error) {
	url := apiBaseURL + "/setApiKeyApi"

	body := map[string]string{
		"api_key": apiKey,
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

	var result setApiKeyResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		if result.Error != "" {
			return &setApiKeyResponse{Success: false, Error: result.Error}, nil
		}
		return &setApiKeyResponse{Success: false, Error: fmt.Sprintf("server returned status %d", resp.StatusCode)}, nil
	}

	return &result, nil
}
