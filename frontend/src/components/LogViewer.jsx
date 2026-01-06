import React, { useEffect, useState, useRef } from 'react';
import { Badge, Button, Space, Tooltip, Typography } from 'antd';
import { DeleteOutlined, VerticalAlignBottomOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useLogContext } from '../context/LogContext';

const { Text } = Typography;

const LogViewer = () => {
  const { logs, connected, clearLogs } = useLogContext();
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const toggleAutoScroll = () => {
    setAutoScroll(!autoScroll);
  };

  const formatMessage = (message) => {
    const parts = message.split(/(『.*?』)/g);
    return parts.map((part, i) => {
      if (part.startsWith('『') && part.endsWith('』')) {
        return <span key={i} style={{ color: '#d7ba7d', fontWeight: 'bold' }}>{part}</span>;
      }
      return part;
    });
  };

  return (
    <div style={{
      border: '1px solid #303030',
      borderRadius: '6px',
      overflow: 'hidden',
      background: '#1e1e1e',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 12px',
        background: '#252526',
        borderBottom: '1px solid #303030',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Space>
          <Badge status={connected ? "success" : "error"} text={<span style={{ color: '#ccc', fontSize: 12 }}>{connected ? "已连接" : "未连接"}</span>} />
          <span style={{ color: '#666', fontSize: 12, marginLeft: 8 }}>{logs.length} 条记录</span>
        </Space>
        <Space>
          <Tooltip title={autoScroll ? "暂停自动滚动" : "开启自动滚动"}>
            <Button
              type="text"
              size="small"
              icon={autoScroll ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={toggleAutoScroll}
              style={{ color: '#ccc' }}
            />
          </Tooltip>
          <Tooltip title="滚动到底部">
            <Button
              type="text"
              size="small"
              icon={<VerticalAlignBottomOutlined />}
              onClick={() => {
                if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
              }}
              style={{ color: '#ccc' }}
            />
          </Tooltip>
          <Tooltip title="清空日志">
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={clearLogs}
              style={{ color: '#ccc' }}
            >
              清空
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* Log Content */}
      <div
        ref={listRef}
        style={{
          height: '400px',
          overflowY: 'auto',
          padding: '12px',
          fontFamily: "'Fira Code', 'Consolas', 'Monaco', 'Courier New', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', monospace",
          fontSize: '13px',
          lineHeight: '1.5',
          color: '#d4d4d4'
        }}
      >
        {logs.length === 0 && (
          <div style={{ textAlign: 'center', color: '#555', marginTop: 40 }}>
            暂无日志数据...
          </div>
        )}
        {logs.map((item, index) => (
          <div key={index} style={{ display: 'flex', marginBottom: 4 }}>
            <span style={{ color: '#569cd6', marginRight: 12, flexShrink: 0, opacity: 0.7 }}>
              {item.time}
            </span>
            <span style={{
              color: item.level === 'ERROR' ? '#f44747' :
                     item.level === 'WARNING' ? '#cca700' : '#6a9955',
              marginRight: 12,
              fontWeight: 'bold',
              width: '50px',
              flexShrink: 0
            }}>
              {item.level}
            </span>
            <span style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
              {formatMessage(item.message)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogViewer;
