package main

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/bipprojectbali/envman/cli/internal/sysstat"
)

// ANSI colors, matching the file-health command's palette.
const (
	cReset  = "\033[0m"
	cGreen  = "\033[32m"
	cYellow = "\033[33m"
	cRed    = "\033[31m"
	cDim    = "\033[2m"
	cBold   = "\033[1m"
)

// statusColor maps a status to its ANSI color.
func statusColor(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return cRed
	case sysstat.Warning:
		return cYellow
	default:
		return cGreen
	}
}

// statusIcon maps a status to a glyph.
func statusIcon(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return "✗"
	case sysstat.Warning:
		return "⚠"
	default:
		return "✓"
	}
}

func printSysReport(r sysstat.Report) {
	// Header line with overall verdict.
	overall := r.Overall()
	fmt.Printf("%s%s %s%s  %s%s%s\n",
		statusColor(overall), statusIcon(overall), r.Host.Hostname, cReset,
		cDim, sysLabel(overall), cReset)

	// Host block.
	fmt.Printf("%shost%s   %s %s (%s) · kernel %s · up %s\n",
		cBold, cReset, r.Host.Platform, r.Host.Version, r.Host.Arch,
		r.Host.Kernel, r.Host.UptimeHuman)
	if r.Host.Virtualization != "" {
		fmt.Printf("       %svirt: %s%s\n", cDim, r.Host.Virtualization, cReset)
	}

	// Identity block (current user, active sessions, network addresses).
	printIdentity(r.Identity, r.Host.Hostname)

	// CPU block.
	fmt.Printf("%scpu%s    %s · %d cores (%d logical) · %.0f%% busy · load %s%.2f%s / %.2f / %.2f\n",
		cBold, cReset, cpuModel(r.CPU.Model), r.CPU.CoresPhysical, r.CPU.CoresLogical,
		r.CPU.UsedPercent, statusColor(r.CPU.LoadStatus), r.CPU.Load1, cReset,
		r.CPU.Load5, r.CPU.Load15)

	// Memory + swap block.
	printMemLine("mem", r.Memory)
	if r.Swap.Total > 0 {
		printMemLine("swap", r.Swap)
	}

	// Disk block.
	if len(r.Disks) > 0 {
		fmt.Printf("%sdisk%s\n", cBold, cReset)
		w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
		for _, d := range r.Disks {
			col := statusColor(d.Status)
			fmt.Fprintf(w, "  %s%s%s\t%s\t%s%.0f%%%s\t%s / %s\t%s\n",
				col, statusIcon(d.Status), cReset, d.Mount,
				col, d.UsedPercent, cReset,
				human(d.Used), human(d.Total), d.Fstype)
		}
		w.Flush()
	}

	// Non-fatal collection warnings.
	for _, msg := range r.Warnings {
		fmt.Fprintf(os.Stderr, "%s[envman] tidak bisa membaca %s%s\n", cDim, msg, cReset)
	}
}

func printMemLine(label string, m sysstat.MemInfo) {
	col := statusColor(m.Status)
	fmt.Printf("%s%-4s%s   %s%s %.0f%%%s  %s / %s used\n",
		cBold, label, cReset, col, statusIcon(m.Status), m.UsedPercent, cReset,
		human(m.Used), human(m.Total))
}

// sysLabel renders a short verdict word for the header.
func sysLabel(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return "perlu perhatian"
	case sysstat.Warning:
		return "ada peringatan"
	default:
		return "sehat"
	}
}

// cpuModel falls back to a placeholder when the model string is empty.
func cpuModel(m string) string {
	if m == "" {
		return "unknown CPU"
	}
	return m
}

// human is a thin exported-style wrapper so the command can format bytes
// without reaching into the package's unexported helper.
func human(b uint64) string { return sysstat.HumanBytes(b) }

// printIdentity renders the current user, active login sessions, and network
// addresses. hostname is passed so single self-sessions (just the current user
// on the local console) can be suppressed as redundant noise.
func printIdentity(id sysstat.Identity, hostname string) {
	// User line: username@hostname (uid).
	who := id.User.Username
	if who == "" {
		who = "unknown"
	}
	line := fmt.Sprintf("%suser%s   %s@%s", cBold, cReset, who, hostname)
	if id.User.UID != "" {
		line += fmt.Sprintf(" %s(uid %s)%s", cDim, id.User.UID, cReset)
	}
	fmt.Println(line)

	// Active sessions: show only when there is more than a lone local login,
	// or when any session comes from a remote host — otherwise it just repeats
	// the user line.
	if sessions := notableSessions(id.Sessions, id.User.Username); len(sessions) > 0 {
		fmt.Printf("%ssessions%s\n", cBold, cReset)
		w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
		for _, s := range sessions {
			from := ""
			if s.Host != "" {
				from = fmt.Sprintf("%sfrom %s%s", cDim, s.Host, cReset)
			}
			fmt.Fprintf(w, "  %s\t%s\t%s\n", s.User, s.Terminal, from)
		}
		w.Flush()
	}

	// Network addresses.
	if len(id.LocalIPs) > 0 || id.PublicIP != "" {
		fmt.Printf("%snet%s\n", cBold, cReset)
		w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
		for _, a := range id.LocalIPs {
			kind := "v4"
			if a.IsV6 {
				kind = "v6"
			}
			fmt.Fprintf(w, "  %s\t%s\t%s%s%s\n", a.Iface, a.Addr, cDim, kind, cReset)
		}
		if id.PublicIP != "" {
			fmt.Fprintf(w, "  %spublic%s\t%s\t%svia --public-ip%s\n", cBold, cReset, id.PublicIP, cDim, cReset)
		}
		w.Flush()
	}
}

// notableSessions filters out the trivial case of a single local session
// belonging to the current user (which the user line already conveys). It keeps
// sessions if there are several, if any is remote, or if another user is on.
func notableSessions(sessions []sysstat.SessionInfo, currentUser string) []sysstat.SessionInfo {
	if len(sessions) == 0 {
		return nil
	}
	// Normalize the current username (host.Users reports bare login names).
	cur := currentUser
	if i := lastIndexByte(cur, '\\'); i >= 0 { // strip DOMAIN\ on Windows
		cur = cur[i+1:]
	}
	if len(sessions) == 1 && sessions[0].User == cur && sessions[0].Host == "" {
		return nil
	}
	return sessions
}

// lastIndexByte reports the index of the last b in s, or -1.
func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}

// maxDirRows caps how many top-level entries the breakdown prints; the rest are
// folded into a "(N lainnya)" line so a big project doesn't flood the terminal.
const maxDirRows = 12

func printDirReport(d sysstat.DirReport) {
	fmt.Printf("%sproject%s  %s   %s%s%s · %s files\n",
		cBold, cReset, d.Root, cBold, human(d.TotalBytes), cReset,
		groupThousands(d.FileCount))

	w := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
	shown := d.Children
	var rest []sysstat.DirEntry
	if len(shown) > maxDirRows {
		rest = shown[maxDirRows:]
		shown = shown[:maxDirRows]
	}
	for _, c := range shown {
		name := c.Name
		if c.IsDir {
			name += "/"
		}
		fmt.Fprintf(w, "  %s\t%s\n", human(c.Bytes), name)
	}
	if len(rest) > 0 {
		var sum uint64
		for _, c := range rest {
			sum += c.Bytes
		}
		fmt.Fprintf(w, "  %s\t%s(%d entri lainnya)%s\n", human(sum), cDim, len(rest), cReset)
	}
	w.Flush()
}

// groupThousands formats an int with dot separators (Indonesian locale style),
// e.g. 48320 -> "48.320".
func groupThousands(n int) string {
	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}
	var b []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			b = append(b, '.')
		}
		b = append(b, c)
	}
	return string(b)
}
