package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

var (
	signupEmail      string
	signupPassword   string
	signupInviteCode string
)

var signupCmd = &cobra.Command{
	Use:   "signup",
	Short: "Create a new account with an invite code",
	Long: `Create a new AskKaya account using an invite code.

You'll need a valid invite code to sign up. Contact your administrator
or the person who referred you to get an invite code.

Example:
  askkaya auth signup`,
	RunE: runSignup,
}

func init() {
	signupCmd.Flags().StringVarP(&signupInviteCode, "code", "c", "", "Invite code")
	signupCmd.Flags().StringVarP(&signupEmail, "email", "e", "", "Email address")
	signupCmd.Flags().StringVarP(&signupPassword, "password", "p", "", "Password")
	authCmd.AddCommand(signupCmd)
}

func runSignup(cmd *cobra.Command, args []string) error {
	reader := bufio.NewReader(os.Stdin)

	// Get invite code
	inviteCode := signupInviteCode
	if inviteCode == "" {
		fmt.Print("Invite code: ")
		var err error
		inviteCode, err = reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("failed to read invite code: %w", err)
		}
		inviteCode = strings.TrimSpace(inviteCode)
	}

	if inviteCode == "" {
		return fmt.Errorf("invite code is required")
	}

	// Validate invite code first
	fmt.Println("Validating invite code...")
	valid, err := validateInvite(inviteCode)
	if err != nil {
		return fmt.Errorf("failed to validate invite code: %w", err)
	}
	if !valid.Valid {
		return fmt.Errorf("invalid invite code: %s", valid.Error)
	}
	fmt.Println("Invite code valid!")

	// Get email
	email := signupEmail
	if email == "" {
		fmt.Print("Email: ")
		email, err = reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("failed to read email: %w", err)
		}
		email = strings.TrimSpace(email)
	}

	if email == "" {
		return fmt.Errorf("email is required")
	}

	// Get password
	password := signupPassword
	if password == "" {
		fmt.Print("Password: ")
		passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			return fmt.Errorf("failed to read password: %w", err)
		}
		fmt.Println()
		password = string(passwordBytes)

		// Confirm password
		fmt.Print("Confirm password: ")
		confirmBytes, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			return fmt.Errorf("failed to read password confirmation: %w", err)
		}
		fmt.Println()

		if password != string(confirmBytes) {
			return fmt.Errorf("passwords do not match")
		}
	}

	if len(password) < 6 {
		return fmt.Errorf("password must be at least 6 characters")
	}

	// Create account
	fmt.Println("Creating account...")
	result, err := createAccount(inviteCode, email, password)
	if err != nil {
		return fmt.Errorf("signup failed: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("signup failed: %s", result.Error)
	}

	fmt.Println("✓ Account created successfully!")
	fmt.Println()

	// If we have a payment URL, offer to open it
	if result.PaymentURL != "" {
		fmt.Println("📋 Complete your subscription to start using AskKaya.")
		fmt.Println()
		fmt.Println("Opening payment page in your browser...")

		if err := openBrowser(result.PaymentURL); err != nil {
			fmt.Println()
			fmt.Println("Could not open browser. Please visit this URL to complete payment:")
			fmt.Println(result.PaymentURL)
		}

		fmt.Println()
		fmt.Println("After payment, login with:")
		fmt.Println("  askkaya auth login")
	} else {
		fmt.Println("You can now login with:")
		fmt.Println("  askkaya auth login")
	}

	return nil
}

// openBrowser opens the specified URL in the default browser
func openBrowser(url string) error {
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

type validateResponse struct {
	Valid bool   `json:"valid"`
	Error string `json:"error,omitempty"`
}

func validateInvite(code string) (*validateResponse, error) {
	url := apiBaseURL + "/validateInviteApi"

	reqBody := fmt.Sprintf(`{"code":"%s"}`, strings.ToUpper(code))

	req, err := http.NewRequest("POST", url, strings.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result validateResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

type signupResponse struct {
	Success    bool   `json:"success"`
	UserID     string `json:"user_id,omitempty"`
	ClientID   string `json:"client_id,omitempty"`
	PaymentURL string `json:"payment_url,omitempty"`
	Message    string `json:"message,omitempty"`
	Error      string `json:"error,omitempty"`
}

func createAccount(inviteCode, email, password string) (*signupResponse, error) {
	url := apiBaseURL + "/signupApi"

	reqBody := fmt.Sprintf(`{"invite_code":"%s","email":"%s","password":"%s"}`,
		strings.ToUpper(inviteCode), email, password)

	req, err := http.NewRequest("POST", url, strings.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result signupResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// Handle non-201 status codes
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		if result.Error != "" {
			return &signupResponse{Success: false, Error: result.Error}, nil
		}
		return &signupResponse{Success: false, Error: fmt.Sprintf("server returned status %d", resp.StatusCode)}, nil
	}

	return &result, nil
}
