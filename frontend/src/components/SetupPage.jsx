import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, App, Steps, Result } from 'antd';
import { UserOutlined, LockOutlined, RocketOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const { Title, Paragraph } = Typography;

const SetupPage = ({ onSetupComplete }) => {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const { message } = App.useApp();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await axios.post('/api/system/setup', {
        username: values.username,
        password: values.password,
        email: values.email || 'admin@example.com'
      });
      setStep(1);
      message.success('管理员账户创建成功！');
      if (onSetupComplete) {
        setTimeout(() => {
            onSetupComplete();
        }, 1500);
      }
    } catch (error) {
      message.error('初始化失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: '#f0f2f5',
      padding: 20
    }}>
      <Card style={{ width: '100%', maxWidth: 500, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <RocketOutlined style={{ fontSize: 48, color: '#FB7299' }} />
          <Title level={2} style={{ marginTop: 16, marginBottom: 8 }}>Magic Market 初始化</Title>
          <Paragraph type="secondary">欢迎使用！请设置您的初始管理员账户。</Paragraph>
        </div>

        <Steps 
          current={step} 
          items={[
            { title: '创建管理员', icon: <UserOutlined /> },
            { title: '完成', icon: <CheckCircleOutlined /> }
          ]}
          style={{ marginBottom: 32 }}
        />

        {step === 0 ? (
          <Form
            name="setup_form"
            layout="vertical"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入管理员用户名' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="管理员用户名" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="设置密码" />
            </Form.Item>

            <Form.Item
              name="confirm_password"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 48, fontSize: 16 }}>
                立即初始化
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <Result
            status="success"
            title="系统初始化完成！"
            subTitle="您现在可以使用管理员账户登录系统了。"
            extra={[
              <Button type="primary" key="login" onClick={() => window.location.reload()}>
                前往登录
              </Button>
            ]}
          />
        )}
      </Card>
    </div>
  );
};

export default SetupPage;
