import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Space, Typography, theme, Table, Image, Tag, Progress, Button } from 'antd';
import {
  ShoppingOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  RiseOutlined,
  FallOutlined,
  PieChartOutlined,
  HeartOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const { Text, Title } = Typography;

const Dashboard = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total_items: 0,
    total_history: 0,
    new_items_today: 0,
    new_history_today: 0,
    category_distribution: {}
  });
  const [priceDrops, setPriceDrops] = useState([]);
  const [recentFavorites, setRecentFavorites] = useState([]);

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/stats');
      setStats(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchRecentFavorites = async () => {
    try {
      const res = await axios.get('/api/favorites/recent');
      setRecentFavorites(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchPriceDrops = async () => {
    try {
      // Fetch items sorted by discount (descending)
      const res = await axios.get('/api/items', {
        params: {
          sort_by: 'discount',
          order: 'desc',
          limit: 10 // Increased limit since we removed new items table
        }
      });
      // Filter only items with actual discount > 0
      const drops = res.data.items.filter(item => item.market_price > item.min_price);
      setPriceDrops(drops);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchPriceDrops();
    fetchRecentFavorites();
    const interval = setInterval(() => {
      fetchStats();
    }, 10000); // Refresh stats every 10s
    return () => clearInterval(interval);
  }, []);

  const goToFavorites = () => {
    // Navigate to items page with state to trigger "only favorites" filter
    // We can use URL query params or state. Let's use state for now, but query params are better for sharing.
    // But ItemTable reads state from useState.
    // Let's just navigate and let user click, or better:
    // We can modify ItemTable to read initial filter from location state.
    navigate('/items', { state: { onlyFavorites: true } });
  };
  // Prepare Chart Data
  const categoryMap = { "2312": "手办", "2066": "模型", "2331": "周边", "2273": "3C" };
  const chartData = Object.entries(stats.category_distribution || {}).map(([key, value]) => ({
    name: categoryMap[key] || key,
    value: value
  }));
  
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  const columns = [
    {
      title: '商品信息',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <Image
            src={record.img}
            width={40}
            height={40}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            fallback="https://via.placeholder.com/40"
            preview={false}
          />
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 180 }}>
            <a href={record.link} target="_blank" rel="noreferrer" style={{ fontWeight: 500, color: token.colorText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {text}
            </a>
            <Text type="secondary" style={{ fontSize: 12 }}>ID: {record.goods_id}</Text>
          </div>
        </Space>
      )
    },
    {
      title: '当前价格',
      dataIndex: 'min_price',
      key: 'min_price',
      width: 100,
      render: (price) => <Text strong style={{ color: token.colorPrimary }}>¥ {price?.toLocaleString()}</Text>
    },
    {
      title: '折扣',
      key: 'discount',
      width: 80,
      render: (_, record) => {
        if (!record.market_price || record.market_price <= record.min_price) return <Text type="secondary">-</Text>;
        const discount = ((record.market_price - record.min_price) / record.market_price * 100).toFixed(0);
        return <Tag color="red">-{discount}%</Tag>;
      }
    }
  ];

  return (
    <div>
      {/* Top Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" hoverable style={{ height: '100%', background: 'linear-gradient(135deg, #fff 0%, #f0f5ff 100%)' }}>
            <Statistic
              title="已追踪商品总数"
              value={stats.total_items}
              prefix={<ShoppingOutlined style={{ color: '#1890ff' }} />}
              suffix={
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 8 }}>
                  今日新增 <span style={{ color: token.colorSuccess, fontWeight: 'bold' }}>+{stats.new_items_today}</span>
                </div>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" hoverable style={{ height: '100%', background: 'linear-gradient(135deg, #fff 0%, #fff7e6 100%)' }}>
            <Statistic
              title="历史价格记录"
              value={stats.total_history}
              prefix={<HistoryOutlined style={{ color: '#fa8c16' }} />}
              suffix={
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 8 }}>
                  今日新增 <span style={{ color: token.colorSuccess, fontWeight: 'bold' }}>+{stats.new_history_today}</span>
                </div>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" hoverable style={{ height: '100%', background: 'linear-gradient(135deg, #fff 0%, #f6ffed 100%)' }}>
            <Statistic
              title="数据更新时间"
              value={new Date().toLocaleTimeString()}
              prefix={<ThunderboltOutlined style={{ color: '#52c41a' }} />}
              suffix={
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 8 }}>
                  系统运行正常
                </div>
              }
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        {/* Left Column: Market Overview */}
        <Col xs={24} lg={14}>
          <Card
            title={<Space><FallOutlined style={{ color: token.colorPrimary }} /><span>捡漏推荐 (高折扣)</span></Space>}
            variant="borderless"
          >
            <Table
              dataSource={priceDrops}
              rowKey="goods_id"
              pagination={false}
              size="small"
              columns={columns}
            />
          </Card>
        </Col>

        {/* Right Column: Personal & Analysis */}
        <Col xs={24} lg={10}>
          <Card
            title={<Space><HeartOutlined style={{ color: '#eb2f96' }} /><span>我的关注动态 (最近更新)</span></Space>}
            extra={<Button type="link" size="small" onClick={goToFavorites}>查看全部 <ArrowRightOutlined /></Button>}
            variant="borderless"
            style={{ marginBottom: 24 }}
          >
            <Table
              dataSource={recentFavorites}
              rowKey="goods_id"
              pagination={false}
              size="small"
              columns={columns}
              locale={{ emptyText: '暂无关注商品或近期无更新' }}
            />
          </Card>
          <Card
            title={<Space><PieChartOutlined /><span>分类占比</span></Space>}
            style={{ height: '400px' }}
            variant="borderless"
          >
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Removed text list to save space and rely on chart legend/tooltip */}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
