package main

import "testing"

// storage upload: aman-by-default (tolak menimpa), --force untuk menimpa.
// Perubahan breaking dari perilaku lama (default overwrite, --no-clobber).
func TestStorageUploadForceFlag(t *testing.T) {
	cmd := storageUploadCmd()

	// Flag --force / -f harus ada (opt-in menimpa).
	force := cmd.Flags().Lookup("force")
	if force == nil {
		t.Fatal("expected --force flag to exist")
	}
	if force.Shorthand != "f" {
		t.Errorf("expected --force shorthand 'f', got %q", force.Shorthand)
	}
	if force.DefValue != "false" {
		t.Errorf("expected --force default false (aman-by-default), got %q", force.DefValue)
	}

	// Flag lama --no-clobber / -n harus SUDAH DIHAPUS (default kini kebalikannya).
	if cmd.Flags().Lookup("no-clobber") != nil {
		t.Error("--no-clobber should be removed (default is now no-overwrite)")
	}
	if cmd.Flags().ShorthandLookup("n") != nil {
		t.Error("-n shorthand should be removed")
	}
}
