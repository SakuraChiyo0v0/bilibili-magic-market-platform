import React, { useState } from 'react';
import { Layout, Menu, theme, Typography, ConfigProvider, App as AntdApp, Tabs } from 'antd';
import { DesktopOutlined, PieChartOutlined, SettingOutlined, RocketOutlined, CodeOutlined } from '@ant-design/icons';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import ControlPanel from './components/ControlPanel';
import ItemTable from './components/ItemTable';
import Settings from './components/Settings';
import { LogProvider } from './context/LogContext';

const { Header, Content, Footer, Sider } = Layout;
const { Title } = Typography;

const DashboardPage = () => {
  const items = [
    {
      key: '1',
      label: <span><PieChartOutlined /> 数据概览</span>,
      children: <Dashboard />,
    },
    {
      key: '2',
      label: <span><CodeOutlined /> 爬虫控制</span>,
      children: <ControlPanel />,
    },
  ];

  return <Tabs defaultActiveKey="1" items={items} />;
};

function AppContent() {
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer, borderRadiusLG, colorPrimary },
  } = theme.useToken();
  const location = useLocation();

  const items = [
    { key: '/', icon: <PieChartOutlined />, label: <Link to="/">数据看板</Link> },
    { key: '/items', icon: <DesktopOutlined />, label: <Link to="/items">商品列表</Link> },
    { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">系统设置</Link> },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
        <div style={{
          height: 64,
          margin: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}>
          <RocketOutlined style={{ fontSize: 24, color: colorPrimary, marginRight: collapsed ? 0 : 10 }} />
          {!collapsed && (
            <span style={{ color: colorPrimary, fontSize: 18, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              Magic Market
            </span>
          )}
        </div>
        <Menu theme="light" defaultSelectedKeys={['/']} selectedKeys={[location.pathname]} mode="inline" items={items} />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'all 0.2s', background: '#f0f2f5' }}>
        <Header style={{ padding: 0, background: colorBgContainer }} />
        <Content style={{ margin: '0 16px', overflow: 'initial' }}>
          <div
            style={{
              margin: '16px 0',
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/items" element={<ItemTable />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </Content>
        <Footer style={{ textAlign: 'center' }}>
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
        <LogProvider>
          <Router>
            <AppContent />
          </Router>
        </LogProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
