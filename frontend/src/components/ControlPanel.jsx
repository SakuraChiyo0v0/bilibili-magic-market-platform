import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Button, App, Space, Collapse, Typography, theme, Divider, Modal } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  SyncOutlined,
  CodeOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import axios from 'axios';
import LogViewer from './LogViewer';

const { Title, Text } = Typography;

const ControlPanel = () => {
  const { token } = theme.useToken();
  const { message, modal } = App.useApp();
  const [scraperStatus, setScraperStatus] = useState({ scheduler_status: 'unknown', is_running: false, next_run: null });
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/scraper/status');
      setScraperStatus(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  // ... (handlers)

  // ... (useEffect)

  const isSchedulerRunning = scraperStatus.scheduler_status === 'running';
  const isScraping = scraperStatus.is_running;

  return (
    <div>
      {/* Status Card */}
      <Card variant="borderless" style={{ marginBottom: 24, background: '#fafafa' }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size="large">
              <Space>
                <ThunderboltOutlined style={{ fontSize: 24, color: isScraping ? token.colorSuccess : token.colorTextSecondary }} />
                <div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>当前状态</div>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: isScraping ? token.colorSuccess : token.colorText }}>
                    {isScraping ? "正在爬取" : "空闲中"}
                  </div>
                </div>
              </Space>
              <Divider type="vertical" style={{ height: 32 }} />
              <Space>
                <ClockCircleOutlined style={{ fontSize: 24, color: isSchedulerRunning ? token.colorPrimary : token.colorTextSecondary }} />
                <div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>定时调度</div>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: isSchedulerRunning ? token.colorPrimary : token.colorText }}>
                    {isSchedulerRunning ? "已开启" : "已关闭"}
                  </div>
                </div>
              </Space>
            </Space>
          </Col>
          <Col>
            {isSchedulerRunning && scraperStatus.next_run && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: token.colorTextSecondary }}>下次自动运行</div>
                <div style={{ fontSize: 16, fontFamily: 'monospace' }}>
                  {new Date(scraperStatus.next_run).toLocaleTimeString()}
                </div>
              </div>
            )}
          </Col>
        </Row>
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
  );
};

export default ControlPanel;
