import React, { useEffect, useState } from 'react';
import { Popover, Badge, List, Typography, Space, Tag } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, BellOutlined, SyncOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const { Text } = Typography;

const TaskMonitor = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [visible, setVisible] = useState(false);

  const fetchTasks = async () => {
    if (!user) return;
    try {
      const res = await axios.get('/api/tasks/active');
      setTasks(res.data);
    } catch (error) {
      console.error("Failed to fetch tasks", error);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, [user]);

  const runningTasks = tasks.filter(t => t.status === 'running');
  const hasRunning = runningTasks.length > 0;

  const content = (
    <div style={{ width: 320 }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
        <Text strong>后台任务</Text>
        {hasRunning && <Tag color="processing" icon={<SyncOutlined spin />}>运行中</Tag>}
      </div>

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
          暂无活动任务
        </div>
      ) : (
        <List
          dataSource={tasks}
          size="small"
          renderItem={item => {
            let statusIcon = <SyncOutlined spin style={{ color: '#1890ff' }} />;
            let statusColor = '#1890ff';

            if (item.status === 'completed') {
                statusIcon = <CheckCircleOutlined style={{ color: '#52c41a' }} />;
                statusColor = '#52c41a';
            }
            if (item.status === 'failed') {
                statusIcon = <CloseCircleOutlined style={{ color: '#f5222d' }} />;
                statusColor = '#f5222d';
            }

            return (
              <List.Item style={{ padding: '8px 0' }}>
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Space>
                      {statusIcon}
                      <Text strong>{item.description}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.status === 'running' ? '进行中...' : item.status === 'completed' ? '已完成' : '失败'}
                    </Text>
                  </div>
                  {item.message && (
                    <div style={{ fontSize: 12, color: '#999', paddingLeft: 24 }}>
                      {item.message}
                    </div>
                  )}
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      title={null}
      trigger="click"
      placement="bottomRight"
      open={visible}
      onOpenChange={setVisible}
    >
      <div style={{ cursor: 'pointer', padding: '0 12px', display: 'inline-block' }}>
        <Badge count={runningTasks.length} offset={[0, 0]} size="small">
          <BellOutlined style={{ fontSize: 18, color: hasRunning ? '#1890ff' : 'inherit' }} />
        </Badge>
      </div>
    </Popover>
  );
};

export default TaskMonitor;
