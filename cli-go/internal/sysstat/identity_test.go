package sysstat

import (
	"net"
	"testing"
)

func TestAddrIP(t *testing.T) {
	ipnet := &net.IPNet{IP: net.ParseIP("192.168.1.5"), Mask: net.CIDRMask(24, 32)}
	if got := addrIP(ipnet); !got.Equal(net.ParseIP("192.168.1.5")) {
		t.Errorf("IPNet → %v, want 192.168.1.5", got)
	}
	ipaddr := &net.IPAddr{IP: net.ParseIP("10.0.0.1")}
	if got := addrIP(ipaddr); !got.Equal(net.ParseIP("10.0.0.1")) {
		t.Errorf("IPAddr → %v, want 10.0.0.1", got)
	}
	if got := addrIP(&net.UnixAddr{Name: "/tmp/x"}); got != nil {
		t.Errorf("non-IP addr → %v, want nil", got)
	}
}

// TestLocalAddrsShape checks that localAddrs returns only non-loopback,
// non-link-local addresses — it runs against the real host, so we assert the
// invariant rather than exact values.
func TestLocalAddrsShape(t *testing.T) {
	warned := false
	addrs := localAddrs(func(string) { warned = true })
	if warned {
		t.Skip("interface enumeration unavailable in this environment")
	}
	for _, a := range addrs {
		ip := net.ParseIP(a.Addr)
		if ip == nil {
			t.Errorf("unparseable addr %q", a.Addr)
			continue
		}
		if ip.IsLoopback() {
			t.Errorf("loopback leaked: %s", a.Addr)
		}
		if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			t.Errorf("link-local leaked: %s", a.Addr)
		}
		if a.Iface == "" {
			t.Error("empty iface name")
		}
		if want := ip.To4() == nil; a.IsV6 != want {
			t.Errorf("IsV6=%v for %s, want %v", a.IsV6, a.Addr, want)
		}
	}
}
