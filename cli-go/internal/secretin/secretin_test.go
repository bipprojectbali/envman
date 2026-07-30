package secretin

import (
	"os"
	"testing"
)

func TestReadPrefersEnvOverArg(t *testing.T) {
	t.Setenv("ENVMAN_TEST_SECRET", "from-env")
	got, err := Read(Options{Arg: "from-arg", EnvVar: "ENVMAN_TEST_SECRET", Label: "test"})
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	// The env var wins so a script that sets both stops leaking via argv.
	if got != "from-env" {
		t.Errorf("got %q, want from-env", got)
	}
}

func TestReadTrimsEnv(t *testing.T) {
	t.Setenv("ENVMAN_TEST_SECRET", "  padded\n")
	got, err := Read(Options{EnvVar: "ENVMAN_TEST_SECRET", Label: "test"})
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if got != "padded" {
		t.Errorf("got %q, want padded (env values often carry a trailing newline)", got)
	}
}

func TestReadFallsBackToArg(t *testing.T) {
	got, err := Read(Options{Arg: "from-arg", EnvVar: "ENVMAN_TEST_UNSET", Label: "test"})
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	// Still accepted: refusing outright would break existing scripts with no
	// warning period. The warning goes to stderr instead.
	if got != "from-arg" {
		t.Errorf("got %q, want from-arg", got)
	}
}

func TestReadEmptyEnvDoesNotWin(t *testing.T) {
	t.Setenv("ENVMAN_TEST_SECRET", "   ")
	got, err := Read(Options{Arg: "from-arg", EnvVar: "ENVMAN_TEST_SECRET", Label: "test"})
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if got != "from-arg" {
		t.Errorf("got %q, want from-arg (a blank env var must not shadow the argument)", got)
	}
}

func TestReadErrorsWithNoSource(t *testing.T) {
	// AllowStdin stays false so the test never blocks reading a terminal.
	_, err := Read(Options{EnvVar: "ENVMAN_TEST_UNSET", Label: "kode klaim"})
	if err == nil {
		t.Fatal("expected an error when no source supplies the secret")
	}
}

func TestIsTerminalOnPipe(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	defer r.Close()
	defer w.Close()
	if isTerminal(r) {
		t.Error("a pipe must not be reported as a terminal, or piped input would prompt instead")
	}
}
