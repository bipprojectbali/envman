package envsync

import (
	"bytes"
	"os"
	"sort"
	"time"
)

// DefaultLabel attributes the appended block to the command that produced it.
const DefaultLabel = "envman env sync"

// Options controls a sync plan. Zero values are documented defaults.
type Options struct {
	SourcePath string    // required; the file that defines the desired key set
	TargetPath string    // required; the file to extend (need not exist yet)
	Now        time.Time // zero -> time.Now(); injectable for deterministic tests
	Label      string    // "" -> DefaultLabel
}

// Missing is one key present in the source but absent from the target.
type Missing struct {
	Key      string
	Value    string   // unquoted; display only
	RawValue string   // verbatim source bytes after '='; what actually gets written
	Group    string   // raw group-heading line from the source, "" if none
	Comments []string // raw comment lines directly above the key in the source
	Line     int      // 1-based line in the source
}

// Summary aggregates a plan so printers never have to count.
type Summary struct {
	SourceKeys   int
	TargetKeys   int
	Missing      int
	Orphan       int
	Common       int
	CommentedOut int
}

// Result is a complete plan. Nothing has been written to disk.
type Result struct {
	SourcePath   string
	TargetPath   string
	Missing      []Missing // source order, deliberately not sorted
	Orphans      []string  // in target only; reported, never removed
	Common       []string  // in both; never touched
	CommentedOut []string  // in source, and present in target but commented out
	Duplicates   []Dup     // duplicate keys seen in the source

	Block         string // block to append; "" when nothing is missing
	NewContent    string // target content after append; "" when nothing is missing
	ExistingBytes []byte // target's current bytes; nil when it does not exist
	TargetExists  bool
	Summary       Summary
}

// Plan reads the source and target and computes everything needed to apply the
// sync. It performs no writes: the caller owns the file mutation, which keeps
// this package trivially testable and lets the cmd layer reuse its own atomic
// writer.
func Plan(opts Options) (Result, error) {
	res := Result{SourcePath: opts.SourcePath, TargetPath: opts.TargetPath}

	src, err := ParseFile(opts.SourcePath)
	if err != nil {
		return res, err
	}

	existing, err := os.ReadFile(opts.TargetPath)
	switch {
	case err == nil:
		res.TargetExists = true
		res.ExistingBytes = existing
	case os.IsNotExist(err):
		res.TargetExists = false
	default:
		return res, err
	}

	tgt := ParseBytes(existing)

	res.Missing, res.Orphans, res.Common, res.CommentedOut = Diff(src, tgt)
	res.Duplicates = src.Duplicates
	res.Summary = Summary{
		SourceKeys:   len(src.Entries),
		TargetKeys:   len(tgt.Entries),
		Missing:      len(res.Missing),
		Orphan:       len(res.Orphans),
		Common:       len(res.Common),
		CommentedOut: len(res.CommentedOut),
	}

	if len(res.Missing) == 0 {
		return res, nil // Block and NewContent stay empty: nothing to write
	}

	// The target's own line ending wins, so appending to a CRLF file does not
	// leave it mixed.
	nl := "\n"
	if bytes.Contains(existing, []byte("\r\n")) {
		nl = "\r\n"
	}

	now := opts.Now
	if now.IsZero() {
		now = time.Now()
	}
	label := opts.Label
	if label == "" {
		label = DefaultLabel
	}

	res.Block = RenderBlock(res.Missing, opts.SourcePath, label, now, nl)
	res.NewContent = AppendTo(existing, res.Block, nl)
	return res, nil
}

// Diff compares two parsed documents by key name only. Values are never
// compared: a key that exists in both is left alone regardless of its value,
// which is what makes this safe to run against a populated .env.
func Diff(src, tgt *Doc) (missing []Missing, orphans, common, commentedOut []string) {
	for _, e := range src.Entries {
		if tgt.Has(e.Key) {
			common = append(common, e.Key)
			continue
		}
		if _, ok := tgt.Commented[e.Key]; ok {
			commentedOut = append(commentedOut, e.Key)
		}
		missing = append(missing, Missing{
			Key:      e.Key,
			Value:    e.Value,
			RawValue: e.RawValue,
			Group:    e.Group,
			Comments: e.Comments,
			Line:     e.Line,
		})
	}
	for _, e := range tgt.Entries {
		if !src.Has(e.Key) {
			orphans = append(orphans, e.Key)
		}
	}
	sort.Strings(orphans)
	sort.Strings(common)
	sort.Strings(commentedOut)
	return missing, orphans, common, commentedOut
}

// MissingKeys returns just the key names, in source order. Used for the
// pipeable --keys-only output.
func MissingKeys(missing []Missing) []string {
	out := make([]string, 0, len(missing))
	for _, m := range missing {
		out = append(out, m.Key)
	}
	return out
}
