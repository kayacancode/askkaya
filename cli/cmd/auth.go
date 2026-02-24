package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"syscall"
	"time"

	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

const keychainService = "askkaya"

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication commands",
	Long:  `Manage your AskKaya authentication. Login to access the API, logout to clear stored credentials.`,
}

var (
	loginEmail    string
	loginPassword string
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login with email and password",
	Long:  `Authenticate with the AskKaya platform using your email and password.`,
	RunE:  runLogin,
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Clear stored credentials",
	Long:  `Remove stored authentication tokens from the system keychain.`,
	RunE:  runLogout,
}

func init() {
	loginCmd.Flags().StringVarP(&loginEmail, "email", "e", "", "Email address")
	loginCmd.Flags().StringVarP(&loginPassword, "password", "p", "", "Password")
	authCmd.AddCommand(loginCmd)
	authCmd.AddCommand(logoutCmd)
}

func runLogin(cmd *cobra.Command, args []string) error {
	if apiKey == "" {
		return fmt.Errorf("FIREBASE_API_KEY environment variable is required")
	}

	email := loginEmail
	password := loginPassword

	// If not provided via flags, prompt interactively
	if email == "" {
		reader := bufio.NewReader(os.Stdin)
		fmt.Print("Email: ")
		var err error
		email, err = reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("failed to read email: %w", err)
		}
		email = strings.TrimSpace(email)
	}

	if password == "" {
		fmt.Print("Password: ")
		passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			return fmt.Errorf("failed to read password: %w", err)
		}
		fmt.Println() // newline after password
		password = string(passwordBytes)
	}

	// Create auth client and sign in
	client := auth.NewClient(apiKey, "https://identitytoolkit.googleapis.com")
	tokens, err := client.SignIn(email, password)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}

	// Fetch user info (including client ID and role) from backend
	fmt.Println("Fetching account info...")
	userInfo, err := fetchUserInfo(tokens.IDToken)
	if err != nil {
		fmt.Printf("Warning: Could not fetch account info: %v\n", err)
	} else {
		tokens.ClientID = userInfo.ClientID
		tokens.UserID = userInfo.UserID
		tokens.Email = userInfo.Email
		tokens.Role = userInfo.Role
		if tokens.Role == "" {
			tokens.Role = "client" // Default to client if not specified
		}
	}

	// Store tokens in keychain
	keychain := auth.NewKeychain(keychainService)
	if err := keychain.StoreTokens(*tokens); err != nil {
		return fmt.Errorf("failed to store credentials: %w", err)
	}

	fmt.Println("Successfully logged in!")
	if tokens.ClientID != "" {
		fmt.Printf("Client: %s\n", userInfo.ClientName)
	}
	return nil
}

type userInfoResponse struct {
	UserID     string `json:"user_id"`
	Email      string `json:"email"`
	ClientID   string `json:"client_id"`
	ClientName string `json:"client_name"`
	Role       string `json:"role"` // "admin" or "client"
}

func fetchUserInfo(idToken string) (*userInfoResponse, error) {
	url := apiBaseURL + "/meApi"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+idToken)

	httpClient := &http.Client{Timeout: 10 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	var info userInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}

	return &info, nil
}

func runLogout(cmd *cobra.Command, args []string) error {
	keychain := auth.NewKeychain(keychainService)
	if err := keychain.ClearTokens(); err != nil {
		return fmt.Errorf("failed to clear credentials: %w", err)
	}

	fmt.Println("Successfully logged out!")
	return nil
}
