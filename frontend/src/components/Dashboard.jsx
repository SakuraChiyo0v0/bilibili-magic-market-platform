import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Button, App, Badge, Space, Collapse, Typography, theme, Divider, Modal, Table, Image, Tag } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  SyncOutlined,
  ShoppingOutlined,
  HistoryOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
  RiseOutlined
} from '@ant-design/icons';
import axios from 'axios';
import LogViewer from './LogViewer';

const { Title, Text } = Typography;

const Dashboard = () => {
  const { token } = theme.useToken();
  const { message, modal } = App.useApp();
  const [stats, setStats] = useState({ total_items: 0, total_history: 0, new_items_today: 0, new_history_today: 0 });
  const [scraperStatus, setScraperStatus] = useState({ scheduler_status: 'unknown', is_running: false, next_run: null });
  const [newItems, setNewItems] = useState([]);
  const [loading, setLoading] = useState(false);

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

  // 1. Continuous Scrape
  const handleContinuousScrape = async () => {
    if (scraperStatus.scheduler_status === 'running') {
      modal.confirm({
        title: '确认启动常驻爬虫?',
        icon: <ExclamationCircleOutlined />,
        content: '检测到定时调度正在运行。启动常驻爬虫将自动暂停定时调度任务。',
        onOk() {
          startContinuous();
        },
        onCancel() {},
      });
    } else {
      startContinuous();
    }
  };

  const startContinuous = async () => {
    setLoading(true);
    try {
      await axios.post('/api/scraper/continuous/start');
      message.success('常驻爬虫已启动');
      fetchStatus();
    } catch (error) {
      message.error('启动失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 2. Interval Scrape (Scheduler)
  const toggleScheduler = async (action) => {
    if (action === 'start' && scraperStatus.is_running) {
      message.warning('无法开启定时调度：检测到常驻爬虫正在运行。请先停止常驻爬虫。');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`/api/scraper/scheduler/toggle?action=${action}`);
      message.success(`定时调度已${action === 'start' ? '开启' : '暂停'}`);
      fetchStatus();
    } catch (error) {
      // Handle backend error message
      const errorMsg = error.response?.data?.detail || '操作失败';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 3. Manual Scrape (One-off)
  const triggerManualScrape = async () => {
    setLoading(true);
    try {
      await axios.post('/api/scraper/manual');
      message.success('已触发手动爬取 (1页)');
      fetchStatus();
    } catch (error) {
      message.error('操作失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Stop Any Scrape
  const stopScrape = async () => {
    setLoading(true);
    try {
      await axios.post('/api/scraper/stop');
      message.success('已发送停止信号');

      // Poll until stopped
      const checkStop = setInterval(async () => {
        try {
          const res = await axios.get('/api/scraper/status');
          setScraperStatus(res.data);
          if (!res.data.is_running) {
            clearInterval(checkStop);
            setLoading(false);
            message.success('爬虫已完全停止');
          }
        } catch (e) {
          clearInterval(checkStop);
          setLoading(false);
        }
      }, 1000);

      // Timeout after 15s
      setTimeout(() => {
        clearInterval(checkStop);
        setLoading(false);
      }, 15000);

    } catch (error) {
      message.error('停止失败');
      setLoading(false);
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

      <Card
        title={<Space><CodeOutlined /><span>控制中心</span></Space>}
        style={{ marginBottom: 24 }}
      >
        <Row gutter={[24, 24]} align="middle">
          {/* 1. Continuous Scrape */}
          <Col xs={24} md={8} style={{ textAlign: 'center' }}>
            <Title level={5}>常驻爬虫</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16, height: 40 }}>
              开启后持续运行，间隔爬取，直到手动停止。
            </Text>
            {isScraping ? (
              <Button
                danger
                type="primary"
                icon={<StopOutlined />}
                onClick={stopScrape}
                loading={loading}
                size="large"
                block
              >
                停止当前任务
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleContinuousScrape}
                loading={loading}
                size="large"
                block
              >
                开启常驻爬虫
              </Button>
            )}
          </Col>

          {/* 2. Interval Scrape */}
          <Col xs={24} md={8} style={{ textAlign: 'center', borderLeft: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
            <Title level={5}>定时调度</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16, height: 40 }}>
              每隔一段时间自动启动一次爬虫任务。
            </Text>
            {isSchedulerRunning ? (
              <Button
                danger
                icon={<PauseCircleOutlined />}
                onClick={() => toggleScheduler('stop')}
                loading={loading}
                size="large"
                block
              >
                暂停定时调度
              </Button>
            ) : (
              <Button
                icon={<ClockCircleOutlined />}
                onClick={() => toggleScheduler('start')}
                loading={loading}
                size="large"
                block
                style={{ borderColor: token.colorPrimary, color: token.colorPrimary }}
              >
                开启定时调度
              </Button>
            )}
          </Col>

          {/* 3. Manual Scrape */}
          <Col xs={24} md={8} style={{ textAlign: 'center' }}>
            <Title level={5}>手动爬取</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16, height: 40 }}>
              立即爬取第 1 页数据，完成后自动结束。
            </Text>
            <Button
              icon={<SyncOutlined />}
              onClick={triggerManualScrape}
              loading={loading}
              disabled={isScraping}
              size="large"
              block
            >
              立即爬取一页
            </Button>
          </Col>
        </Row>

        <Divider />

        <Collapse ghost defaultActiveKey={['1']} items={[
          {
            key: '1',
            label: '实时系统日志',
            children: <LogViewer />
          }
        ]} />
      </Card>
    </div>
  );
};

export default Dashboard;