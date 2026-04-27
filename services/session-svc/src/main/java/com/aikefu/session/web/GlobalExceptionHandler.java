package com.aikefu.session.web;

import java.time.Instant;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.aikefu.session.service.SessionService.SessionNotFoundException;
import com.aikefu.session.service.SessionStateMachine.IllegalStateTransitionException;

/** 把领域异常转译为统一 HTTP 响应。 */
@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(SessionNotFoundException.class)
  public ResponseEntity<Map<String, Object>> notFound(SessionNotFoundException ex) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("session_not_found", ex));
  }

  @ExceptionHandler(IllegalStateTransitionException.class)
  public ResponseEntity<Map<String, Object>> conflict(IllegalStateTransitionException ex) {
    return ResponseEntity.status(HttpStatus.CONFLICT).body(error("illegal_state_transition", ex));
  }

  private Map<String, Object> error(String code, Exception ex) {
    return Map.of(
        "code", code,
        "message", ex.getMessage(),
        "ts", Instant.now().toString());
  }
}
