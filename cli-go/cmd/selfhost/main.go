// Command selfhost is the Go rewrite of the self-hosted infrastructure CLI.
package main

import (
	"os"

	"github.com/ZeiZel/self-hosted/cli-go/internal/commands"
)

func main() {
	if err := commands.NewRoot().Execute(); err != nil {
		os.Exit(1)
	}
}
