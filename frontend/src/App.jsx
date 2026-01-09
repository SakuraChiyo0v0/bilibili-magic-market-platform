import React, { useState, useEffect } from 'react';
import { Layout, Menu, theme, Typography, ConfigProvider, App as AntdApp, Tabs, Button, Dropdown, Avatar, Space, Spin, Modal, Form, Input, Drawer, Grid } from 'antd';
import { DesktopOutlined, PieChartOutlined, SettingOutlined, RocketOutlined, CodeOutlined, ApiOutlined, UserOutlined, LogoutOutlined, LockOutlined, TeamOutlined, MenuOutlined } from '@ant-design/icons';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import ControlPanel from './components/ControlPanel';
import ItemTable from './components/ItemTable';
import Settings from './components/Settings';
import ApiDocs from './components/ApiDocs';
import AuthPage from './components/AuthPage';
import SetupPage from './components/SetupPage';
import UserList from './components/UserList';
import { LogProvider } from './context/LogContext';
import { AuthProvider, useAuth } from './context/AuthContext';

import TaskMonitor from './components/TaskMonitor';

const { Header, Content, Footer, Sider } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const DashboardPage = () => {
  return <Dashboard />;
};

const PrivateRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const ForcePasswordChangeModal = ({ visible, onLogout }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = AntdApp.useApp();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await axios.post('/api/auth/change-password', {
        old_password: values.old_password,
        new_password: values.new_password
      });
      message.success('密码修改成功，请重新登录');
      onLogout();
    } catch (error) {
      message.error('修改失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={<Space><LockOutlined style={{ color: '#faad14' }} /> 安全警告：请修改默认密码</Space>}
      open={visible}
      footer={null}
      closable={false}
      maskClosable={false}
      keyboard={false}
    >
      <div style={{ marginBottom: 24 }}>
        <Text type="secondary">检测到您正在使用默认密码 (admin123)。为了系统安全，请立即修改密码。</Text>
      </div>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="old_password"
          label="当前密码"
          initialValue="admin123"
          hidden
        >
          <Input.Password />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="新密码"
          rules={[{ required: true, message: '请输入新密码' }]}
        >
          <Input.Password placeholder="请输入新密码" />
        </Form.Item>
        <Form.Item
          name="confirm_password"
          label="确认新密码"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请确认新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('new_password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="请再次输入新密码" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} danger>
            确认修改并重新登录
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

function AppContent() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const screens = useBreakpoint();

  const {
    token: { colorBgContainer, borderRadiusLG, colorPrimary },
  } = theme.useToken();
  const location = useLocation();
  const { user, logout, isInitialized, checkSystemStatus } = useAuth();

  // Check initialization status
  if (isInitialized === null) {
     return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>;
  }

  if (isInitialized === false) {
    return <SetupPage onSetupComplete={() => {
        checkSystemStatus();
    }} />;
  }

  // If on login page, render it directly without layout
  if (location.pathname === '/login') {
    return <AuthPage />;
  }

  const items = [
    { key: '/', icon: <PieChartOutlined />, label: <Link to="/" onClick={() => setMobileMenuOpen(false)}>数据看板</Link> },
    { key: '/items', icon: <DesktopOutlined />, label: <Link to="/items" onClick={() => setMobileMenuOpen(false)}>商品列表</Link> },
  ];

  // Only admin can see Control Panel and User Management
  if (user?.role === 'admin') {
    items.push(
      { key: '/control', icon: <CodeOutlined />, label: <Link to="/control" onClick={() => setMobileMenuOpen(false)}>爬虫控制</Link> },
      { key: '/users', icon: <TeamOutlined />, label: <Link to="/users" onClick={() => setMobileMenuOpen(false)}>用户管理</Link> }
    );
  }

  // API Access is available for everyone (to apply for developer)
  items.push({ key: '/api', icon: <ApiOutlined />, label: <Link to="/api" onClick={() => setMobileMenuOpen(false)}>API 接入</Link> });

  // Settings is available for everyone (for password change), but content differs
  items.push({ key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>系统设置</Link> });

  const userMenu = {
    items: [
      {
        key: 'logout',
        label: '退出登录',
        icon: <LogoutOutlined />,
        onClick: logout,
      },
    ],
  };

  // Determine if we are on mobile (xs screen)
  // Note: screens.xs might be undefined on first render, so we default to false or check if screens is empty
  const isMobile = screens.xs === true;

  const renderLogo = () => (
    <div style={{
      height: 64,
      margin: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      <RocketOutlined style={{ fontSize: 24, color: colorPrimary, marginRight: (collapsed && !isMobile) ? 0 : 10 }} />
      {(!collapsed || isMobile) && (
        <span style={{ color: colorPrimary, fontSize: 18, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
          Magic Market
        </span>
      )}
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {user?.is_default_password && <ForcePasswordChangeModal visible={true} onLogout={logout} />}

      {/* Mobile Drawer Navigation */}
      <Drawer
        placement="left"
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
        width={240}
        styles={{ body: { padding: 0 } }}
        closable={false}
      >
        {renderLogo()}
        <Menu theme="light" defaultSelectedKeys={['/']} selectedKeys={[location.pathname]} mode="inline" items={items} />
      </Drawer>

      {/* Desktop Sider Navigation */}
      {!isMobile && (
        <Sider
          theme="light"
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)'
          }}
        >
          {renderLogo()}
          <Menu theme="light" defaultSelectedKeys={['/']} selectedKeys={[location.pathname]} mode="inline" items={items} />
        </Sider>
      )}

      <Layout style={{
        marginLeft: isMobile ? 0 : (collapsed ? 80 : 200),
        transition: 'all 0.2s',
        background: '#f0f2f5'
      }}>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isMobile ? (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMobileMenuOpen(true)}
              style={{ fontSize: '16px', width: 64, height: 64, marginLeft: -24 }}
            />
          ) : <div />}

          {user && (
            <Space size={isMobile ? "small" : "large"}>
              {!isMobile && <TaskMonitor />}
              <Dropdown menu={userMenu}>
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar icon={<UserOutlined />} style={{ backgroundColor: colorPrimary }} />
                  {!isMobile && <Text strong>{user.username}</Text>}
                </Space>
              </Dropdown>
            </Space>
          )}
        </Header>
        <Content style={{ margin: isMobile ? '16px 8px' : '0 16px', overflow: 'initial' }}>
          {isMobile && <div style={{ marginBottom: 16 }}><TaskMonitor /></div>}
          <div
            style={{
              margin: isMobile ? '0' : '16px 0',
              padding: isMobile ? 12 : 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            <Routes>
              <Route path="/login" element={<AuthPage />} />
              <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
              <Route path="/items" element={<PrivateRoute><ItemTable /></PrivateRoute>} />
              <Route path="/control" element={<PrivateRoute><ControlPanel /></PrivateRoute>} />
              <Route path="/users" element={<PrivateRoute><UserList /></PrivateRoute>} />
              <Route path="/api" element={<PrivateRoute><ApiDocs /></PrivateRoute>} />
              <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
            </Routes>
          </div>
        </Content>
        <Footer style={{ textAlign: 'center', padding: isMobile ? '12px 0' : '24px 50px' }}>
          魔力赏市场爬虫 ©{new Date().getFullYear()} 由 MiCode 创建
        </Footer>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#FB7299',
        },
      }}
    >
      <AntdApp>
        <AuthProvider>
          <LogProvider>
            <Router>
              <AppContent />
            </Router>
          </LogProvider>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
