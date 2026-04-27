//go:build redis

package main

import "github.com/ai-kefu/gateway-ws/internal/registry"

func newRedisRegistry(addr string) registry.Registry {
	if addr == "" {
		return nil
	}
	return registry.NewRedis(addr)
}
