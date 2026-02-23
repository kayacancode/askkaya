package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"syscall"

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

	// Store tokens in keychain
	keychain := auth.NewKeychain(keychainService)
	if err := keychain.StoreTokens(*tokens); err != nil {
		return fmt.Errorf("failed to store credentials: %w", err)
	}

	fmt.Println("Successfully logged in!")
	return nil
}

func runLogout(cmd *cobra.Command, args []string) error {
	keychain := auth.NewKeychain(keychainService)
	if err := keychain.ClearTokens(); err != nil {
		return fmt.Errorf("failed to clear credentials: %w", err)
	}

	fmt.Println("Successfully logged out!")
	return nil
}
