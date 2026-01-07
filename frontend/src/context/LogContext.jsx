import React, { createContext, useState, useEffect, useRef, useContext } from 'react';
import { App } from 'antd';
import axios from 'axios';

const LogContext = createContext();

export const useLogContext = () => useContext(LogContext);

export const LogProvider = ({ children }) => {
  const { notification } = App.useApp();
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false); // Used to indicate polling status
  const lastTimestampRef = useRef(0);
  const intervalRef = useRef(null);
  const isPollingRef = useRef(false);

  const fetchLogs = async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const res = await axios.get('/api/logs', {
        params: { since: lastTimestampRef.current }
      });

      setConnected(true);
      const newLogs = res.data;

      if (newLogs.length > 0) {
        // Update timestamp to the latest log's timestamp
        lastTimestampRef.current = newLogs[newLogs.length - 1].timestamp;

        setLogs((prevLogs) => {
          // Merge and keep last 1000
          const merged = [...prevLogs, ...newLogs];
          return merged.slice(-1000);
        });

        // Check for specific alerts in new logs
        newLogs.forEach(log => {
             if (log.message && log.message.includes("RATE_LIMIT_EXCEEDED")) {
               notification.warning({
                  message: '请求过于频繁',
                  description: '检测到 429 错误，已自动增加请求间隔 1 秒。',
                  duration: 5,
               });
            }
        });
      }
    } catch (error) {
      console.error("Poll logs error:", error);
      setConnected(false);
    } finally {
      isPollingRef.current = false;
    }
  };

  const startPolling = () => {
    stopPolling();
    // Initial fetch
    fetchLogs();
    // Poll every 1 second
    intervalRef.current = setInterval(fetchLogs, 1000);
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, []);

  const reconnect = () => {
    // Reset timestamp to re-fetch recent logs or just continue?
    // Let's just restart polling
    setConnected(false);
    startPolling();
  };

  const clearLogs = () => {
    setLogs([]);
    // Optional: Reset timestamp to now? Or keep fetching new ones?
    // If we clear UI logs, we probably still want to fetch *new* logs from now on.
    // But if we don't reset timestamp, we won't get old logs again (which is correct).
  };

  return (
    <LogContext.Provider value={{ logs, connected, clearLogs, reconnect }}>
      {children}
    </LogContext.Provider>
  );
};
