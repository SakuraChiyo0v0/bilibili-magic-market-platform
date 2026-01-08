import React from 'react';
import { Card, Typography, Space, Descriptions, Button, Alert, Divider, Table, Tag, Tabs } from 'antd';
import { ApiOutlined, CopyOutlined, LinkOutlined, CodeOutlined, RocketOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const ApiDocs = () => {
  // Dynamically get the current hostname (e.g., localhost, 192.168.x.x, or domain)
  // and assume the backend is on port 8111 via HTTP.
  const baseUrl = `http://${window.location.hostname}:8111`;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
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

# 1. 获取商品列表
response = requests.get(f"{base_url}/api/items", params={"skip": 0, "limit": 10})
items = response.json()
print(f"获取到 {items['total']} 个商品")

# 2. 获取统计信息
stats = requests.get(f"{base_url}/api/stats").json()
print(f"当前系统共收录 {stats['total_items']} 个商品")`;

  const curlExample = `# 获取商品列表
curl -X 'GET' \\
  '${baseUrl}/api/items?skip=0&limit=10' \\
  -H 'accept: application/json'

# 获取统计信息
curl -X 'GET' \\
  '${baseUrl}/api/stats' \\
  -H 'accept: application/json'`;

  return (
    <div>
      <Card
        title={<Space><ApiOutlined /><span>API 接口接入指南</span></Space>}
        extra={<Tag color="processing">Running on Port 8111</Tag>}
        style={{ marginBottom: 24 }}
      >
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
    </div>
  );
};

export default ApiDocs;
