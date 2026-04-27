//go:build !redis

package main

import "github.com/ai-kefu/gateway-ws/internal/registry"

// newRedisRegistry 默认构建不引入 redis 依赖。
func newRedisRegistry(_ string) registry.Registry { return nil }
