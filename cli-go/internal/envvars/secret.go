package envvars

import "strings"

// secretPatterns are case-insensitive substrings that mark a key as sensitive.
// Kept deliberately broad; users override per-key via --plain / --secret.
var secretPatterns = []string{
	"SECRET",
	"PASSWORD",
	"PASSWD",
	"PRIVATE_KEY",
	"API_KEY",
	"CREDENTIAL",
	"DATABASE_URL",
	"_DSN",
	"TOKEN",
}

// DetectSecret reports whether a key name looks sensitive by heuristic.
// Matches any secretPattern as a substring, plus a "_KEY" suffix — but NOT a
// bare "PUBLIC_KEY", which is conventionally non-sensitive.
func DetectSecret(key string) bool {
	up := strings.ToUpper(key)
	if strings.Contains(up, "PUBLIC_KEY") {
		return false
	}
	for _, p := range secretPatterns {
		if strings.Contains(up, p) {
			return true
		}
	}
	return strings.HasSuffix(up, "_KEY")
}

// ClassifySecrets returns the set of keys to store as secret for the given
// local vars. Rules, in order:
//   - if detect is false, nothing is auto-detected
//   - a key in forcePlain is never secret (highest priority)
//   - a key in forceSecret is always secret
//   - a key already secret on the server stays secret (server wins)
//   - otherwise, DetectSecret decides
func ClassifySecrets(local map[string]string, existingSecret map[string]bool, forcePlain, forceSecret map[string]bool, detect bool) map[string]bool {
	out := make(map[string]bool)
	for k := range local {
		switch {
		case forcePlain[k]:
			// explicit plain always wins
		case forceSecret[k]:
			out[k] = true
		case existingSecret[k]:
			out[k] = true
		case detect && DetectSecret(k):
			out[k] = true
		}
	}
	return out
}
