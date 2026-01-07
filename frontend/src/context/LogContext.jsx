import React, { createContext, useState, useEffect, useRef, useContext } from 'react';
import { notification } from 'antd';

const LogContext = createContext();

export const useLogContext = () => useContext(LogContext);

export const LogProvider = ({ children }) => {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);

  const connect = () => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // host includes port if present
    const wsUrl = `${protocol}//${host}/ws/logs`;

    if (ws.current) {
      ws.current.onclose = null;
      ws.current.close();
    }

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setConnected(true);
      console.log('WebSocket Connected');
    };

    ws.current.onclose = () => {
      setConnected(false);
      console.log('WebSocket Disconnected');
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket Error:', error);
      if (ws.current) ws.current.close();
    };

    ws.current.onmessage = (event) => {
      const log = JSON.parse(event.data);

      if (log.message && log.message.includes("RATE_LIMIT_EXCEEDED")) {
           notification.warning({
              message: '请求过于频繁',
              description: '检测到 429 错误，已自动增加请求间隔 1 秒。',
              duration: 5,
           });
      }

      setLogs((prevLogs) => {
        // Simple deduplication based on time and message
        const isDuplicate = prevLogs.length > 0 &&
          prevLogs[prevLogs.length - 1].time === log.time &&
          prevLogs[prevLogs.length - 1].message === log.message;

        if (isDuplicate) return prevLogs;

        const newLogs = [...prevLogs, log];
        if (newLogs.length > 1000) { // Keep last 1000 logs
          return newLogs.slice(newLogs.length - 1000);
        }
        return newLogs;
      });
    };
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
    };
  }, []);

  const reconnect = () => {
    setConnected(false);
    connect();
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <LogContext.Provider value={{ logs, connected, clearLogs, reconnect }}>
      {children}
    </LogContext.Provider>
  );
};
