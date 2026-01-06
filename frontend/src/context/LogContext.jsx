import React, { createContext, useState, useEffect, useRef, useContext } from 'react';
import { notification } from 'antd';

const LogContext = createContext();

export const useLogContext = () => useContext(LogContext);

export const LogProvider = ({ children }) => {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout = null;

    const connect = () => {
      if (!isMounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = '8000';
      const wsUrl = `${protocol}//${host}:${port}/ws/logs`;

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        if (isMounted) {
          setConnected(true);
          console.log('WebSocket Connected');
        }
      };

      ws.current.onclose = () => {
        if (isMounted) {
          setConnected(false);
          console.log('WebSocket Disconnected');
          // Only reconnect if mounted
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket Error:', error);
        if (ws.current) ws.current.close();
      };

      ws.current.onmessage = (event) => {
        if (!isMounted) return;
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

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws.current) {
        // Remove listener to prevent onclose triggering reconnect
        ws.current.onclose = null;
        ws.current.close();
      }
    };
  }, []);

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <LogContext.Provider value={{ logs, connected, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
};
