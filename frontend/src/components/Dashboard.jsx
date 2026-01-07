import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Space, Typography, theme, Table, Image, Tag } from 'antd';
import {
  ShoppingOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  RiseOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

const Dashboard = () => {
  const { token } = theme.useToken();
  const [stats, setStats] = useState({ total_items: 0, total_history: 0, new_items_today: 0, new_history_today: 0 });
  const [scraperStatus, setScraperStatus] = useState({ scheduler_status: 'unknown', is_running: false, next_run: null });
  const [newItems, setNewItems] = useState([]);

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/stats');
      setStats(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchNewItems = async () => {
    try {
      const res = await axios.get('/api/items/today/new');
      setNewItems(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/scraper/status');
      setScraperStatus(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchStatus();
    fetchNewItems();
    const interval = setInterval(() => {
      fetchStats();
      fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const isSchedulerRunning = scraperStatus.scheduler_status === 'running';
  const isScraping = scraperStatus.is_running;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" hoverable style={{ height: '100%' }}>
            <Statistic
              title="已追踪商品"
              value={stats.total_items}
              prefix={<ShoppingOutlined style={{ color: token.colorPrimary }} />}
              suffix={
                <div style={{ fontSize: 14, color: token.colorTextSecondary, marginTop: 4 }}>
                  今日新增: <span style={{ color: token.colorSuccess }}>+{stats.new_items_today}</span>
                </div>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" hoverable style={{ height: '100%' }}>
            <Statistic
              title="历史价格记录"
              value={stats.total_history}
              prefix={<HistoryOutlined style={{ color: token.colorWarning }} />}
              suffix={
                <div style={{ fontSize: 14, color: token.colorTextSecondary, marginTop: 4 }}>
                  今日新增: <span style={{ color: token.colorSuccess }}>+{stats.new_history_today}</span>
                </div>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" hoverable style={{ height: '100%' }}>
            <Statistic
              title="爬虫状态"
              value={isScraping ? "正在爬取" : "空闲中"}
              valueStyle={{ color: isScraping ? token.colorSuccess : token.colorTextSecondary, fontSize: 20 }}
              prefix={<ThunderboltOutlined />}
              suffix={
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
                  {isSchedulerRunning ? `定时调度: 开启 (下次: ${scraperStatus.next_run ? new Date(scraperStatus.next_run).toLocaleTimeString() : '-'})` : "定时调度: 关闭"}
                </div>
              }
            />
          </Card>
        </Col>
      </Row>

      {/* New Items Table */}
      <Card
        title={<Space><RiseOutlined style={{ color: token.colorSuccess }} /><span>今日新增商品</span></Space>}
        style={{ marginBottom: 24 }}
        variant="borderless"
      >
        <Table
          dataSource={newItems}
          rowKey="goods_id"
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          size="small"
          columns={[
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
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <a href={record.link} target="_blank" rel="noreferrer" style={{ fontWeight: 500, color: token.colorText }}>
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
              width: 120,
              render: (price) => <Text strong style={{ color: token.colorPrimary }}>¥ {price?.toLocaleString()}</Text>
            },
            {
              title: '市场价',
              dataIndex: 'market_price',
              key: 'market_price',
              width: 120,
              render: (price) => <Text type="secondary">¥ {price?.toLocaleString()}</Text>
            },
            {
              title: '分类',
              dataIndex: 'category',
              key: 'category',
              width: 100,
              render: (cat) => {
                const map = { "2312": "手办", "2066": "模型", "2331": "周边", "2273": "3C" };
                return <Tag>{map[cat] || cat}</Tag>;
              }
            }
          ]}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
