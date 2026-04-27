package router

import (
	"context"

	"github.com/ai-kefu/gateway-ws/internal/frame"
	"github.com/ai-kefu/gateway-ws/internal/wsconn"
)

// Composite 串联多个 Router,顺序合并出帧。
//
// 任一 router 报错都不会阻断后续 router(只把错误降级为日志意义);
// 这样在 M1 阶段 SessionRouter(持久化)失败时,EchoRouter 仍可给到客户端反馈。
type Composite struct {
	Inner []wsconn.Router
}

// NewComposite 构造 composite。
func NewComposite(routers ...wsconn.Router) *Composite {
	return &Composite{Inner: routers}
}

// Handle 实现 wsconn.Router。
func (c *Composite) Handle(ctx context.Context, conn *wsconn.Conn, in frame.Frame) ([]frame.Frame, error) {
	out := make([]frame.Frame, 0, 4)
	for _, r := range c.Inner {
		fs, _ := r.Handle(ctx, conn, in)
		out = append(out, fs...)
	}
	return out, nil
}
