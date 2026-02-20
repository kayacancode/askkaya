package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "askkaya",
	Short: "AskKaya - Client support platform CLI",
	Long:  `AskKaya is a full-stack client support platform with Go CLI, Firebase backend, and Next.js admin dashboard.`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Welcome to AskKaya CLI!")
	},
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
