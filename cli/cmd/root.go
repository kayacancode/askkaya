package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	// Configuration
	apiBaseURL string
	apiKey     string
	clientID   string
)

var rootCmd = &cobra.Command{
	Use:   "askkaya",
	Short: "AskKaya - Client support platform CLI",
	Long: `AskKaya is a full-stack client support platform CLI.

Use this tool to query the support system with questions about your setup.
The system uses AI-powered RAG to provide accurate answers from your
organization's knowledge base.`,
	Version: "0.1.0",
}

// Execute runs the root command
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	// Persistent flags available to all subcommands
	rootCmd.PersistentFlags().StringVar(&apiBaseURL, "api-url", getEnvOrDefault("ASKKAYA_API_URL", "https://us-central1-askkaya-47cef.cloudfunctions.net"), "API base URL")
	rootCmd.PersistentFlags().StringVar(&apiKey, "api-key", getEnvOrDefault("FIREBASE_API_KEY", "AIzaSyBNGefyftcjv1E1MrOoj11DA8H60jXSdgc"), "Firebase API key")
	rootCmd.PersistentFlags().StringVar(&clientID, "client-id", os.Getenv("ASKKAYA_CLIENT_ID"), "Client ID")

	// Hide internal flags from help
	rootCmd.PersistentFlags().MarkHidden("api-key")
	rootCmd.PersistentFlags().MarkHidden("api-url")
	rootCmd.PersistentFlags().MarkHidden("client-id")

	// Add subcommands
	rootCmd.AddCommand(authCmd)
	rootCmd.AddCommand(queryCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(heartbeatCmd)
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// exitWithError prints an error and exits
func exitWithError(msg string, err error) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %s: %v\n", msg, err)
	} else {
		fmt.Fprintf(os.Stderr, "Error: %s\n", msg)
	}
	os.Exit(1)
}
