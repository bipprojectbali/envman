package envparser

import (
	"bufio"
	"os"
	"strings"
)

// ParseFile reads a .env-style file and returns key=value pairs.
// Rules: skip blank lines and # comments, strip surrounding quotes, trim key whitespace.
func ParseFile(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return ParseReader(bufio.NewReader(f)), nil
}

func ParseReader(r *bufio.Reader) map[string]string {
	result := make(map[string]string)
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := line[idx+1:]
		val = stripQuotes(val)
		result[key] = val
	}
	return result
}

func ParseString(s string) map[string]string {
	r := bufio.NewReader(strings.NewReader(s))
	return ParseReader(r)
}

func stripQuotes(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}
