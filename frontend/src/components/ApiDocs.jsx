import React, { useState } from 'react';
import { Card, Typography, Space, Descriptions, Button, Alert, Divider, Table, Tag, Tabs, Input, Select, message } from 'antd';
import { ApiOutlined, CopyOutlined, LinkOutlined, CodeOutlined, RocketOutlined, KeyOutlined, PlayCircleOutlined } from '@ant-design/icons';
import ApiKeys from './ApiKeys';
import axios from 'axios';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

const ApiDocs = () => {
  // Dynamically get the current hostname (e.g., localhost, 192.168.x.x, or domain)
  // and assume the backend is on port 8111 via HTTP.
  const baseUrl = `http://${window.location.hostname}:8111`;
  const [testKey, setTestKey] = useState('');
  const [testEndpoint, setTestEndpoint] = useState('/api/items');
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  const handleTest = async () => {
    if (!testKey) {
      message.error('请输入 API Key');
      return;
    }
    setLoading(true);
    setTestResult(null);
    try {
      // Use axios directly to bypass the global interceptor which adds the Bearer token
      // We want to test ONLY the API Key auth
      const res = await axios.get(testEndpoint, {
        headers: {
          'X-API-Key': testKey,
          'Authorization': '' // Explicitly remove Authorization header
        }
      });
      setTestResult(JSON.stringify(res.data, null, 2));
      message.success('请求成功');
    } catch (error) {
      setTestResult(JSON.stringify(error.response?.data || error.message, null, 2));
      message.error('请求失败');
    } finally {
      setLoading(false);
    }
  };

  const commonEndpoints = [
    {
      key: '1',
      method: 'GET',
      path: '/api/items',
      desc: '获取商品列表 (支持分页、搜索、排序)',
    },
    {
      key: '2',
      method: 'GET',
      path: '/api/items/{id}/history',
      desc: '获取指定商品的历史价格记录',
    },
    {
      key: '3',
      method: 'GET',
      path: '/api/stats',
      desc: '获取系统统计数据 (商品总数、历史记录数)',
    },
    {
      key: '4',
      method: 'POST',
      path: '/api/scrape',
      desc: '触发一次手动爬取任务',
    },
  ];

  const columns = [
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      render: (method) => (
        <Tag color={method === 'GET' ? 'blue' : method === 'POST' ? 'green' : 'orange'}>
          {method}
        </Tag>
      ),
    },
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
      render: (text) => <Text code>{text}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'desc',
      key: 'desc',
    },
  ];

  const pythonExample = `import requests

base_url = "${baseUrl}"
api_key = "sk-..." # 您的 API Key

headers = {
    "X-API-Key": api_key
}

# 1. 获取商品列表
response = requests.get(f"{base_url}/api/items", params={"skip": 0, "limit": 10}, headers=headers)
items = response.json()
print(f"获取到 {items['total']} 个商品")

# 2. 获取统计信息
stats = requests.get(f"{base_url}/api/stats", headers=headers).json()
print(f"当前系统共收录 {stats['total_items']} 个商品")`;

  const curlExample = `# 获取商品列表
curl -X 'GET' \\
  '${baseUrl}/api/items?skip=0&limit=10' \\
  -H 'accept: application/json' \\
  -H 'X-API-Key: sk-...'

# 获取统计信息
curl -X 'GET' \\
  '${baseUrl}/api/stats' \\
  -H 'accept: application/json' \\
  -H 'X-API-Key: sk-...'`;

  const items = [
    {
      key: '1',
      label: <span><KeyOutlined /> API Key 管理</span>,
      children: <ApiKeys />,
    },
    {
      key: '2',
      label: <span><ApiOutlined /> 接口文档</span>,
      children: (
        <Card variant="borderless">
          <Alert
            message="后端服务端口已暴露"
            description={`本系统后端服务运行在 ${window.location.hostname}:8111。您可以直接调用以下接口将数据集成到其他应用中。`}
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />

          <Descriptions title="基础连接信息" bordered column={1}>
            <Descriptions.Item label="Base URL">
              <Space>
                <Text copyable>{baseUrl}</Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Swagger UI (交互式文档)">
              <a href={`${baseUrl}/docs`} target="_blank" rel="noreferrer">
                <Button type="link" icon={<LinkOutlined />}>
                  {baseUrl}/docs
                </Button>
              </a>
            </Descriptions.Item>
            <Descriptions.Item label="ReDoc (静态文档)">
              <a href={`${baseUrl}/redoc`} target="_blank" rel="noreferrer">
                <Button type="link" icon={<LinkOutlined />}>
                  {baseUrl}/redoc
                </Button>
              </a>
            </Descriptions.Item>
          </Descriptions>

          <Divider orientation="left">常用接口概览</Divider>
          <Table
            dataSource={commonEndpoints}
            columns={columns}
            pagination={false}
            size="small"
            bordered
          />

          <Divider orientation="left">在线调试</Divider>
          <Card size="small" style={{ background: '#fafafa' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Input
                  placeholder="在此输入您的 API Key (sk-...)"
                  style={{ width: 300 }}
                  value={testKey}
                  onChange={e => setTestKey(e.target.value)}
                  prefix={<KeyOutlined style={{ color: '#ccc' }} />}
                />
                <Select
                  defaultValue="/api/items"
                  style={{ width: 200 }}
                  onChange={setTestEndpoint}
                  value={testEndpoint}
                >
                  <Option value="/api/items">GET /api/items</Option>
                  <Option value="/api/stats">GET /api/stats</Option>
                  <Option value="/api/favorites/ids">GET /api/favorites/ids</Option>
                </Select>
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleTest} loading={loading}>
                  发送请求
                </Button>
              </Space>

              {testResult && (
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">响应结果:</Text>
                  <div style={{
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    padding: 12,
                    borderRadius: 6,
                    maxHeight: 300,
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {testResult}
                  </div>
                </div>
              )}
            </Space>
          </Card>

          <Divider orientation="left">调用示例</Divider>
          <Tabs defaultActiveKey="1" items={[
            {
              key: '1',
              label: 'Python',
              children: (
                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                  <pre style={{ margin: 0 }}>{pythonExample}</pre>
                </div>
              ),
              icon: <CodeOutlined />
            },
            {
              key: '2',
              label: 'cURL',
              children: (
                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                  <pre style={{ margin: 0 }}>{curlExample}</pre>
                </div>
              ),
              icon: <RocketOutlined />
            }
          ]} />
        </Card>
      ),
    },
  ];

  return <Tabs defaultActiveKey="1" items={items} />;
};

export default ApiDocs;
