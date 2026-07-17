package sysstat

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"os/user"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/host"
)

// Identity describes who is on the machine and how it is reachable on the
// network. Everything here except PublicIP is read locally with no egress.
type Identity struct {
	User     UserInfo      `json:"user"`
	Sessions []SessionInfo `json:"sessions,omitempty"` // active logins (who)
	LocalIPs []IfaceAddr   `json:"localIPs,omitempty"`
	PublicIP string        `json:"publicIP,omitempty"` // only when explicitly requested
}

// UserInfo is the account running the CLI.
type UserInfo struct {
	Username string `json:"username"`
	UID      string `json:"uid"`
	Name     string `json:"name,omitempty"`
}

// SessionInfo is one active login session (like a `who` row).
type SessionInfo struct {
	User     string `json:"user"`
	Terminal string `json:"terminal"`
	Host     string `json:"host,omitempty"` // remote origin, if any
}

// IfaceAddr is a non-loopback address bound to a network interface.
type IfaceAddr struct {
	Iface string `json:"iface"`
	Addr  string `json:"addr"`
	IsV6  bool   `json:"isV6"`
}

// publicIPEndpoint is the default service queried for the public IP. It returns
// the caller's address as plain text. Overridable via ENVMAN_PUBLIC_IP_URL so
// nothing is locked to one provider.
const publicIPEndpoint = "https://api.ipify.org"

// collectIdentity gathers the local (network-free) identity: current user,
// active login sessions, and non-loopback interface addresses. Best-effort.
func collectIdentity(ctx context.Context, warn func(string)) Identity {
	var id Identity

	if u, err := user.Current(); err == nil {
		id.User = UserInfo{Username: u.Username, UID: u.Uid, Name: u.Name}
	} else if h, herr := os.Hostname(); herr == nil {
		id.User = UserInfo{Username: os.Getenv("USER"), Name: h}
	}

	if sessions, err := host.UsersWithContext(ctx); err == nil {
		for _, s := range sessions {
			id.Sessions = append(id.Sessions, SessionInfo{
				User:     s.User,
				Terminal: s.Terminal,
				Host:     s.Host,
			})
		}
	} // sessions are optional; a read failure is not worth a warning

	id.LocalIPs = localAddrs(warn)
	return id
}

// localAddrs returns non-loopback, non-link-local interface addresses.
func localAddrs(warn func(string)) []IfaceAddr {
	ifaces, err := net.Interfaces()
	if err != nil {
		warn("interfaces: " + err.Error())
		return nil
	}
	var out []IfaceAddr
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := ifc.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ip := addrIP(a)
			if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
				continue
			}
			out = append(out, IfaceAddr{
				Iface: ifc.Name,
				Addr:  ip.String(),
				IsV6:  ip.To4() == nil,
			})
		}
	}
	return out
}

// addrIP extracts the net.IP from an interface address.
func addrIP(a net.Addr) net.IP {
	switch v := a.(type) {
	case *net.IPNet:
		return v.IP
	case *net.IPAddr:
		return v.IP
	}
	return nil
}

// PublicIP fetches the machine's public IP from an external service. This is
// the only part of sysstat that touches the network, so it is called only when
// the operator opts in (--public-ip). Endpoint overridable via
// ENVMAN_PUBLIC_IP_URL. Returns an error the caller can surface as a warning.
func PublicIP(ctx context.Context) (string, error) {
	endpoint := publicIPEndpoint
	if v := strings.TrimSpace(os.Getenv("ENVMAN_PUBLIC_IP_URL")); v != "" {
		endpoint = v
	}
	ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64))
	if err != nil {
		return "", err
	}
	ip := strings.TrimSpace(string(body))
	if net.ParseIP(ip) == nil {
		return "", &net.ParseError{Type: "IP address", Text: ip}
	}
	return ip, nil
}
