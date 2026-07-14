package envvars

import "testing"

func TestDetectSecret(t *testing.T) {
	cases := []struct {
		key  string
		want bool
	}{
		{"API_TOKEN", true},
		{"ACCESS_TOKEN", true},
		{"CLIENT_SECRET", true},
		{"DB_PASSWORD", true},
		{"OPENAI_API_KEY", true},
		{"MASTER_KEY", true},
		{"RSA_PRIVATE_KEY", true},
		{"GCP_CREDENTIALS", true},
		{"DATABASE_URL", true},
		{"REDIS_DSN", true},
		{"password", true},  // case-insensitive
		{"my_secret", true}, // substring
		// non-secrets
		{"PUBLIC_KEY", false}, // explicit exception
		{"PORT", false},
		{"NODE_ENV", false},
		{"BASE_URL", false},
		{"APP_NAME", false},
		{"MAX_RETRIES", false},
	}
	for _, c := range cases {
		if got := DetectSecret(c.key); got != c.want {
			t.Errorf("DetectSecret(%q) = %v, want %v", c.key, got, c.want)
		}
	}
}

func TestClassifySecrets(t *testing.T) {
	local := map[string]string{
		"API_TOKEN":  "x",
		"PORT":       "3000",
		"LICENSE":    "y",
		"PUBLIC_URL": "z",
		"OLD_SECRET": "w",
	}

	t.Run("auto-detect on", func(t *testing.T) {
		got := ClassifySecrets(local, nil, nil, nil, true)
		if !got["API_TOKEN"] || !got["OLD_SECRET"] {
			t.Errorf("expected API_TOKEN + OLD_SECRET detected, got %v", got)
		}
		if got["PORT"] || got["PUBLIC_URL"] {
			t.Errorf("PORT/PUBLIC_URL should not be secret, got %v", got)
		}
	})

	t.Run("no-detect disables auto", func(t *testing.T) {
		got := ClassifySecrets(local, nil, nil, nil, false)
		if len(got) != 0 {
			t.Errorf("no-detect should yield no secrets, got %v", got)
		}
	})

	t.Run("force secret adds", func(t *testing.T) {
		got := ClassifySecrets(local, nil, nil, map[string]bool{"LICENSE": true}, false)
		if !got["LICENSE"] {
			t.Errorf("LICENSE should be forced secret, got %v", got)
		}
	})

	t.Run("force plain wins over detect", func(t *testing.T) {
		got := ClassifySecrets(local, nil, map[string]bool{"API_TOKEN": true}, nil, true)
		if got["API_TOKEN"] {
			t.Errorf("API_TOKEN forced plain should not be secret, got %v", got)
		}
	})

	t.Run("server secret preserved (server wins)", func(t *testing.T) {
		// PORT is not detected as secret, but server already has it as secret.
		got := ClassifySecrets(local, map[string]bool{"PORT": true}, nil, nil, true)
		if !got["PORT"] {
			t.Errorf("server-side secret PORT should be preserved, got %v", got)
		}
	})

	t.Run("force plain wins over server secret", func(t *testing.T) {
		got := ClassifySecrets(local, map[string]bool{"API_TOKEN": true}, map[string]bool{"API_TOKEN": true}, nil, true)
		if got["API_TOKEN"] {
			t.Errorf("explicit --plain should override server secret, got %v", got)
		}
	})
}
