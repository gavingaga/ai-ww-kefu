// Package visitor 访客 token 校验 — HS256 JWT,与 session-svc JwtCodec 同密钥派生规则。
//
// 与 Java 端 JwtCodec 一致:
//   - 密钥若 < 32 字节,先 SHA-256 派生,再做 HMAC key;否则直接用原字节。
//   - 校验过期(exp 字段)。
package visitor

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Verifier 用于校验 visitor token。Secret 留空则视为关闭 token 验证(dev 兼容)。
type Verifier struct {
	enabled bool
	key     []byte
}

// NewVerifier:secret 与 session-svc 端的 aikefu.visitor.jwt.secret 一致;空时禁用。
func NewVerifier(secret string) *Verifier {
	if secret == "" {
		return &Verifier{enabled: false}
	}
	var k []byte
	if len(secret) < 32 {
		s := sha256.Sum256([]byte(secret))
		k = s[:]
	} else {
		k = []byte(secret)
	}
	return &Verifier{enabled: true, key: k}
}

func (v *Verifier) Enabled() bool { return v != nil && v.enabled }

// Claims 解出的 token 字段(只关心 sid / sub)。
type Claims struct {
	SID     string
	Subject int64
}

// ErrTokenInvalid token 校验失败的统一错误。
var ErrTokenInvalid = errors.New("visitor: token invalid")

// Verify 校验 token,返回 claims;失败返 ErrTokenInvalid。
func (v *Verifier) Verify(token string) (Claims, error) {
	if v == nil || !v.enabled {
		return Claims{}, errors.New("visitor: verifier not enabled")
	}
	if token == "" {
		return Claims{}, ErrTokenInvalid
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, ErrTokenInvalid
	}
	signing := parts[0] + "." + parts[1]
	want, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return Claims{}, ErrTokenInvalid
	}
	mac := hmac.New(sha256.New, v.key)
	mac.Write([]byte(signing))
	got := mac.Sum(nil)
	if !hmac.Equal(want, got) {
		return Claims{}, ErrTokenInvalid
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, ErrTokenInvalid
	}
	var raw map[string]any
	if err := json.Unmarshal(payloadBytes, &raw); err != nil {
		return Claims{}, ErrTokenInvalid
	}
	if exp, ok := raw["exp"].(float64); ok {
		if int64(exp) < time.Now().Unix() {
			return Claims{}, ErrTokenInvalid
		}
	}
	c := Claims{}
	if sid, ok := raw["sid"].(string); ok {
		c.SID = sid
	}
	if sub, ok := raw["sub"].(float64); ok {
		c.Subject = int64(sub)
	}
	return c, nil
}
