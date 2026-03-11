package cmd

import (
	"fmt"
	"strings"

	"github.com/askkaya/cli/internal/api"
	"github.com/askkaya/cli/internal/auth"
	"github.com/spf13/cobra"
)

var twinCmd = &cobra.Command{
	Use:   "twin",
	Short: "Manage digital twins",
	Long: `Manage digital twins in your organization.

Twins are queryable knowledge personas that can represent:
  - People (individual knowledge bases)
  - Teams (shared team knowledge)
  - Organizations (company-wide knowledge)

Commands:
  twin list        List all accessible twins
  twin info <name> Get details about a twin`,
}

var twinListCmd = &cobra.Command{
	Use:   "list",
	Short: "List accessible twins",
	Long:  `List all digital twins you have access to in your organization.`,
	RunE:  runTwinList,
}

var twinInfoCmd = &cobra.Command{
	Use:   "info <name>",
	Short: "Get details about a twin",
	Long:  `Display detailed information about a specific twin.`,
	Args:  cobra.ExactArgs(1),
	RunE:  runTwinInfo,
}

func init() {
	twinCmd.AddCommand(twinListCmd)
	twinCmd.AddCommand(twinInfoCmd)
}

func runTwinList(cmd *cobra.Command, args []string) error {
	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	tenantID := tokens.TenantID
	if tenantID == "" {
		tenantID = tokens.ClientID
	}

	apiClient := api.NewClientWithTenant(apiBaseURL, tokens.IDToken, tokens.ClientID, tenantID)

	authClient := auth.NewClient(apiKey, "https://identitytoolkit.googleapis.com")
	authClient.SetTokens(*tokens)
	apiClient.SetTokenRefresher(authClient.GetCurrentToken)

	twins, err := apiClient.ListTwins()
	if err != nil {
		return fmt.Errorf("failed to list twins: %w", err)
	}

	if len(twins) == 0 {
		fmt.Println("No twins available.")
		return nil
	}

	fmt.Println("Digital Twins")
	fmt.Println()

	// Group by type
	var orgTwins, teamTwins, personTwins []api.Twin
	for _, t := range twins {
		switch t.Type {
		case "organization":
			orgTwins = append(orgTwins, t)
		case "team":
			teamTwins = append(teamTwins, t)
		case "person":
			personTwins = append(personTwins, t)
		}
	}

	if len(orgTwins) > 0 {
		fmt.Println("🏢 Organization")
		for _, t := range orgTwins {
			printTwinDetails(t)
		}
		fmt.Println()
	}

	if len(teamTwins) > 0 {
		fmt.Println("👥 Teams")
		for _, t := range teamTwins {
			printTwinDetails(t)
		}
		fmt.Println()
	}

	if len(personTwins) > 0 {
		fmt.Println("👤 People")
		for _, t := range personTwins {
			printTwinDetails(t)
		}
		fmt.Println()
	}

	fmt.Printf("Total: %d twins\n", len(twins))

	return nil
}

func runTwinInfo(cmd *cobra.Command, args []string) error {
	twinName := args[0]

	keychain := auth.NewKeychain(keychainService)
	tokens, err := keychain.LoadAndRefreshTokens(apiKey)
	if err != nil {
		return fmt.Errorf("not logged in. Run 'askkaya auth login' first")
	}

	tenantID := tokens.TenantID
	if tenantID == "" {
		tenantID = tokens.ClientID
	}

	apiClient := api.NewClientWithTenant(apiBaseURL, tokens.IDToken, tokens.ClientID, tenantID)

	authClient := auth.NewClient(apiKey, "https://identitytoolkit.googleapis.com")
	authClient.SetTokens(*tokens)
	apiClient.SetTokenRefresher(authClient.GetCurrentToken)

	// List twins and find the matching one
	twins, err := apiClient.ListTwins()
	if err != nil {
		return fmt.Errorf("failed to list twins: %w", err)
	}

	var found *api.Twin
	for _, t := range twins {
		if strings.EqualFold(t.Slug, twinName) || strings.EqualFold(t.Name, twinName) {
			found = &t
			break
		}
	}

	if found == nil {
		return fmt.Errorf("twin '%s' not found", twinName)
	}

	// Display detailed info
	icon := getTwinIcon(found.Type)
	fmt.Printf("%s %s\n", icon, found.Name)
	fmt.Println(strings.Repeat("─", 40))
	fmt.Printf("Slug:       %s\n", found.Slug)
	fmt.Printf("Type:       %s\n", found.Type)
	fmt.Printf("Visibility: %s\n", found.Visibility)

	if len(found.ExpertiseAreas) > 0 {
		fmt.Printf("Expertise:  %s\n", strings.Join(found.ExpertiseAreas, ", "))
	}

	fmt.Println()
	fmt.Printf("Query: ask %s \"your question\"\n", found.Slug)

	return nil
}

func printTwinDetails(t api.Twin) {
	visibility := ""
	switch t.Visibility {
	case "private":
		visibility = " (private)"
	case "team":
		visibility = " (team)"
	}

	fmt.Printf("  %-20s %s%s\n", t.Slug, t.Name, visibility)
}
