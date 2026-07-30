package main

import (
	"encoding/json"
	"os"
)

// emitJSON writes v to stdout as indented JSON.
//
// Shared so every --json flag produces byte-identical shape rules instead of
// each command hand-rolling an encoder. stdout stays pure data — status lines
// belong on stderr — which is what makes `envman ... --json | jq` work.
func emitJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
