package com.aikefu.routing.web;

import java.time.Instant;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.aikefu.routing.service.RoutingService.AgentNotFound;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(AgentNotFound.class)
  public ResponseEntity<Map<String, Object>> notFound(AgentNotFound ex) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(
            Map.of(
                "code", "agent_not_found",
                "message", ex.getMessage(),
                "ts", Instant.now().toString()));
  }
}
