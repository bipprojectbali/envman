package gists

// MergeResult reports how a push changed a gist's file set.
type MergeResult struct {
	Files       []File   // the resulting file set to send to the server
	Added       []string // filenames newly added
	Overwritten []string // existing filenames replaced (required force)
	Conflicts   []string // existing filenames a push would overwrite without force
	// Dropped lists files that clean=true removes. Without it the caller can
	// only report "now N files" and the user never learns what disappeared.
	Dropped []string
}

// MergeFiles computes the new file set when pushing `pushed` onto `existing`.
//
//   - clean=true: the gist becomes exactly `pushed` (existing files dropped).
//     force is irrelevant — clean is itself the explicit "replace" intent.
//   - clean=false: existing files are kept; a pushed file with a new name is
//     added; a pushed file whose name already exists is only overwritten when
//     force is true, otherwise it is recorded in Conflicts and left unchanged.
//
// When Conflicts is non-empty the caller should abort without applying Files.
func MergeFiles(existing, pushed []File, clean, force bool) MergeResult {
	if clean {
		keep := make(map[string]bool, len(pushed))
		names := make([]string, len(pushed))
		for i, f := range pushed {
			names[i] = f.Filename
			keep[f.Filename] = true
		}
		var dropped []string
		for _, f := range existing {
			if !keep[f.Filename] {
				dropped = append(dropped, f.Filename)
			}
		}
		return MergeResult{Files: pushed, Added: names, Dropped: dropped}
	}

	idx := make(map[string]int, len(existing))
	result := make([]File, len(existing))
	for i, f := range existing {
		result[i] = f
		idx[f.Filename] = i
	}

	var res MergeResult
	for _, pf := range pushed {
		if i, ok := idx[pf.Filename]; ok {
			if !force {
				res.Conflicts = append(res.Conflicts, pf.Filename)
				continue
			}
			result[i] = pf
			res.Overwritten = append(res.Overwritten, pf.Filename)
		} else {
			result = append(result, pf)
			idx[pf.Filename] = len(result) - 1
			res.Added = append(res.Added, pf.Filename)
		}
	}
	res.Files = result
	return res
}
