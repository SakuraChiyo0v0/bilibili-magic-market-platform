import React, { useEffect, useState } from 'react';
import { Card, Button, Table, Tag, Space, Popconfirm, App, Typography, Modal, Input, Form, Alert, Empty } from 'antd';
import { KeyOutlined, PlusOutlined, DeleteOutlined, CopyOutlined, RocketOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const { Text, Paragraph } = Typography;

const ApiKeys = () => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [newKey, setNewKey] = useState(null);

  useEffect(() => {
    if (user) {
      // Check if user is developer (we might need to refresh user profile or check via API)
      // For now, let's assume we check via an API call or user object update
      // Actually, user object in context might be stale if we just applied.
      // Let's fetch keys directly, if 403 then not developer.
      fetchKeys();
    }
  }, [user]);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/keys');
      setKeys(res.data);
      setIsDeveloper(true);
    } catch (error) {
      if (error.response && error.response.status === 403) {
        setIsDeveloper(false);
      } else {
        console.error(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    try {
      await axios.post('/api/developer/apply');
      message.success('恭喜！您已成为开发者');
      fetchKeys();
    } catch (error) {
      message.error('申请失败');
    }
  };

  const handleCreate = async (values) => {
    try {
      const res = await axios.post('/api/keys', values);
      setNewKey(res.data);
      fetchKeys();
      setIsModalVisible(false);
      form.resetFields();
    } catch (error) {
      message.error('创建失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/keys/${id}`);
      message.success('删除成功');
      fetchKeys();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const copyKey = (text) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  const columns = [
    {
      title: '备注名称',
      dataIndex: 'name',
      key: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Key 前缀',
      dataIndex: 'prefix',
      key: 'prefix',
      render: (text) => <Tag fontFamily="monospace">{text}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: '最后使用',
      dataIndex: 'last_used_at',
      key: 'last_used_at',
      render: (text) => text ? new Date(text).toLocaleString() : <Text type="secondary">未使用</Text>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Popconfirm title="确定删除此 Key 吗?" onConfirm={() => handleDelete(record.id)}>
          <Button type="text" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  if (!isDeveloper) {
    return (
      <Card style={{ textAlign: 'center', padding: 40 }}>
        <Empty
          image={<RocketOutlined style={{ fontSize: 60, color: '#1890ff' }} />}
          description={
            <span>
              <Text strong style={{ fontSize: 16 }}>开启开发者模式</Text>
              <br />
              <Text type="secondary">申请成为开发者，获取 API Key，通过代码自动化访问数据。</Text>
            </span>
          }
        >
          <Button type="primary" onClick={handleApply} size="large">
            立即申请
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <div>
      <Card 
        title={<Space><KeyOutlined /><span>API Key 管理</span></Space>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>新建 Key</Button>}
        style={{ marginBottom: 24 }}
      >
        <Table
          columns={columns}
          dataSource={keys}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '暂无 API Key' }}
        />
      </Card>

      {/* Create Key Modal */}
      <Modal
        title="新建 API Key"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item
            name="name"
            label="备注名称"
            rules={[{ required: true, message: '请输入备注名称' }]}
          >
            <Input placeholder="例如：我的 Python 脚本" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              生成
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Success Modal */}
      <Modal
        title="API Key 创建成功"
        open={!!newKey}
        onCancel={() => setNewKey(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setNewKey(null)}>
            我已保存
          </Button>
        ]}
        closable={false}
        maskClosable={false}
      >
        <Alert
          message="请立即复制并保存您的 API Key"
          description="出于安全考虑，我们不会再次显示此 Key。如果您丢失了它，需要创建一个新的。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
          <Text code style={{ flex: 1, fontSize: 16, wordBreak: 'break-all' }}>{newKey?.key}</Text>
          <Button type="text" icon={<CopyOutlined />} onClick={() => copyKey(newKey?.key)} />
        </div>
      </Modal>
    </div>
  );
};

export default ApiKeys;
