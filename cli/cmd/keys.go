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

var keysCmd = &cobra.Command{
	Use:   "keys",
	Short: "Manage API keys",
	Long:  `Create, list, and revoke API keys for programmatic access to AskKaya.`,
}

var keysCreateCmd = &cobra.Command{
	Use:   "create [name]",
	Short: "Create a new API key",
	Long: `Create a new API key for programmatic access.

The key will only be shown once - save it securely.

Examples:
  askkaya keys create "My Script"
  askkaya keys create "Production Bot"`,
	Args: cobra.ExactArgs(1),
	RunE: runKeysCreate,
}

var keysListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all API keys",
	RunE:  runKeysList,
}

var keysRevokeCmd = &cobra.Command{
	Use:   "revoke [key-id]",
	Short: "Revoke an API key",
	Args:  cobra.ExactArgs(1),
	RunE:  runKeysRevoke,
}

func init() {
	keysCmd.AddCommand(keysCreateCmd)
	keysCmd.AddCommand(keysListCmd)
	keysCmd.AddCommand(keysRevokeCmd)
	rootCmd.AddCommand(keysCmd)
}

type createKeyResponse struct {
	Success bool   `json:"success"`
	Key     string `json:"key"`
	KeyID   string `json:"keyId"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

func runKeysCreate(cmd *cobra.Command, args []string) error {
	name := args[0]

	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	fmt.Printf("Creating API key '%s'...\n", name)

	// Call API
	url := apiBaseURL + "/apiKeysApi"
	body := map[string]string{"name": name}
	bodyBytes, _ := json.Marshal(body)

	req, err := http.NewRequest("POST", url, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tokens.IDToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	var result createKeyResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		if result.Error != "" {
			return fmt.Errorf("failed: %s", result.Error)
		}
		return fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	fmt.Println("\n✓ API key created successfully!")
	fmt.Println("")
	fmt.Printf("  Key: %s\n", result.Key)
	fmt.Println("")
	fmt.Println("  ⚠️  Save this key now - it won't be shown again.")
	fmt.Println("")
	fmt.Println("Usage with curl:")
	fmt.Printf("  curl -H \"Authorization: Bearer %s\" ...\n", result.Key)

	return nil
}

type listKeysResponse struct {
	Keys []struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Prefix     string `json:"prefix"`
		CreatedAt  string `json:"createdAt"`
		LastUsedAt string `json:"lastUsedAt"`
		Revoked    bool   `json:"revoked"`
	} `json:"keys"`
	Error string `json:"error,omitempty"`
}

func runKeysList(cmd *cobra.Command, args []string) error {
	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	// Call API
	url := apiBaseURL + "/apiKeysApi"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tokens.IDToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	var result listKeysResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		if result.Error != "" {
			return fmt.Errorf("failed: %s", result.Error)
		}
		return fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	if len(result.Keys) == 0 {
		fmt.Println("No API keys found. Create one with: askkaya keys create \"My Key\"")
		return nil
	}

	fmt.Println("API Keys:")
	fmt.Println("")
	for _, key := range result.Keys {
		status := "active"
		if key.Revoked {
			status = "revoked"
		}
		fmt.Printf("  %s  %s (%s)\n", key.Prefix+"...", key.Name, status)
		fmt.Printf("    ID: %s\n", key.ID)
		if key.LastUsedAt != "" {
			fmt.Printf("    Last used: %s\n", key.LastUsedAt)
		}
		fmt.Println("")
	}

	return nil
}

type revokeKeyResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

func runKeysRevoke(cmd *cobra.Command, args []string) error {
	keyID := args[0]

	// Load tokens from keychain
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	fmt.Printf("Revoking API key %s...\n", keyID)

	// Call API
	url := apiBaseURL + "/apiKeysApi?keyId=" + keyID
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tokens.IDToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer resp.Body.Close()

	var result revokeKeyResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		if result.Error != "" {
			return fmt.Errorf("failed: %s", result.Error)
		}
		return fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	fmt.Println("✓ API key revoked successfully")
	return nil
}
