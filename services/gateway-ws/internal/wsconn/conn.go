// Package wsconn 实现一个客户端 WS 连接的读写循环。
//
// 协议遵循 packages/proto/ws/{client,events}.schema.json:
//   - 客户端 ping → 服务端 pong
//   - 服务端按 PingPeriod 主动推 WebSocket Pong frame(WS 协议层心跳),
//     PongWait 内未收到则关闭连接
//   - 业务帧:msg.text / msg.image / msg.file / msg.read / event.* / pull / ack
//
// M1 阶段把业务帧透传到 router(由上层注入,默认本地 echo);
// M2 起接 Kafka chat.in / session-svc。
package wsconn

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/ai-kefu/gateway-ws/internal/frame"
)

// Router 接收业务帧并产出 0..n 条服务端帧的处理器。
// 实现可以是同步(本地 echo / mock)或异步(投到 Kafka 后立即返回 nil)。
type Router interface {
	// Handle 处理一条入帧。返回的 frames 会按顺序写回客户端。
	Handle(ctx context.Context, c *Conn, in frame.Frame) (out []frame.Frame, err error)
}

// Options 连接初始化选项。
type Options struct {
	Logger            *slog.Logger
	Router            Router
	WriteWait         time.Duration
	PongWait          time.Duration
	PingPeriod        time.Duration
	MaxFrameBytes     int64
	MaxPendingPerConn int
}

// Conn 表示一条客户端连接。
type Conn struct {
	id        string
	userID    string
	sessionID atomic.Value // string
	ws        *websocket.Conn
	send      chan []byte
	opts      Options
	once      sync.Once
	closed    chan struct{}
	seq       atomic.Int64 // 服务端发送 seq 累加
}

// New 创建并启动一条连接的读写 goroutine;阻塞直到任一方向出错或对端关闭。
func New(ws *websocket.Conn, opts Options, userID string) *Conn {
	c := &Conn{
		id:     uuid.NewString(),
		userID: userID,
		ws:     ws,
		send:   make(chan []byte, opts.MaxPendingPerConn),
		opts:   opts,
		closed: make(chan struct{}),
	}
	c.sessionID.Store("")
	if opts.MaxFrameBytes > 0 {
		ws.SetReadLimit(opts.MaxFrameBytes)
	}
	return c
}

// Run 启动读写循环。Run 阻塞直到连接关闭。
func (c *Conn) Run(ctx context.Context) {
	go c.writeLoop(ctx)
	c.readLoop(ctx)
}

// ID 实现 hub.Conn 接口。
func (c *Conn) ID() string { return c.id }

// SessionID 实现 hub.Conn 接口。
func (c *Conn) SessionID() string {
	if v := c.sessionID.Load(); v != nil {
		return v.(string)
	}
	return ""
}

// UserID 实现 hub.Conn 接口。
func (c *Conn) UserID() string { return c.userID }

// SetSessionID 关联会话。
func (c *Conn) SetSessionID(sid string) {
	c.sessionID.Store(sid)
}

// Send 非阻塞投递。队列满返回 false,由调用方决定是否断开。
func (c *Conn) Send(payload []byte) bool {
	select {
	case c.send <- payload:
		return true
	default:
		return false
	}
}

// SendFrame 给一帧编 seq 后入队。
func (c *Conn) SendFrame(f frame.Frame) bool {
	if f.Seq == 0 {
		f.Seq = c.seq.Add(1)
	}
	if f.TS == 0 {
		f.TS = time.Now().UnixMilli()
	}
	data, err := frame.Encode(f)
	if err != nil {
		c.logger().Error("encode frame", "err", err)
		return false
	}
	return c.Send(data)
}

// Close 关闭连接。重复调用安全。
func (c *Conn) Close() {
	c.once.Do(func() {
		close(c.closed)
		_ = c.ws.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
			time.Now().Add(c.opts.WriteWait))
		_ = c.ws.Close()
	})
}

func (c *Conn) logger() *slog.Logger {
	if c.opts.Logger != nil {
		return c.opts.Logger.With("conn_id", c.id, "uid", c.userID)
	}
	return slog.Default().With("conn_id", c.id)
}

func (c *Conn) readLoop(ctx context.Context) {
	defer c.Close()
	c.ws.SetReadDeadline(time.Now().Add(c.opts.PongWait))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(c.opts.PongWait))
		return nil
	})
	for {
		_, data, err := c.ws.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseNormalClosure,
				websocket.CloseAbnormalClosure) {
				c.logger().Info("read end", "err", err)
			}
			return
		}
		f, err := frame.Decode(data)
		if err != nil {
			c.sendError(ctx, "bad_frame", err.Error())
			continue
		}
		// 心跳应答:客户端 ping → 服务端 pong
		if f.Type == frame.TypePing {
			c.SendFrame(frame.Frame{Type: frame.TypePong, TS: time.Now().UnixMilli()})
			continue
		}
		if f.Type == frame.TypeAck {
			// ack 仅用于让服务端裁剪缓存,这里只记录
			c.logger().Debug("ack", "to", f.Ack)
			continue
		}
		if c.opts.Router == nil {
			// 无 router(测试场景):直接 echo 一条 system 提示
			c.SendFrame(frame.Frame{
				Type:      frame.TypeMsgChunk,
				SessionID: f.SessionID,
				Payload:   json.RawMessage(`{"chunk":"echo: no router","end":true}`),
			})
			continue
		}
		out, herr := c.opts.Router.Handle(ctx, c, f)
		if herr != nil {
			c.sendError(ctx, "handle_error", herr.Error())
			continue
		}
		for _, o := range out {
			if !c.SendFrame(o) {
				c.logger().Warn("send queue full, dropping conn")
				return
			}
		}
	}
}

func (c *Conn) writeLoop(ctx context.Context) {
	ticker := time.NewTicker(c.opts.PingPeriod)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.closed:
			return
		case payload, ok := <-c.send:
			c.ws.SetWriteDeadline(time.Now().Add(c.opts.WriteWait))
			if !ok {
				_ = c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.ws.WriteMessage(websocket.TextMessage, payload); err != nil {
				c.logger().Info("write end", "err", err)
				return
			}
		case <-ticker.C:
			c.ws.SetWriteDeadline(time.Now().Add(c.opts.WriteWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Conn) sendError(_ context.Context, code, msg string) {
	body, _ := json.Marshal(map[string]string{"code": code, "message": msg})
	c.SendFrame(frame.Frame{Type: frame.TypeError, Payload: body})
}

// ErrSendFull 投递队列已满。
var ErrSendFull = errors.New("send queue full")
