import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Button, App, Space, Collapse, Typography, theme, Divider, Modal } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  SyncOutlined,
  CodeOutlined,
  StopOutlined,
  ExclamationCircleOutlined
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
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const isSchedulerRunning = scraperStatus.scheduler_status === 'running';
  const isScraping = scraperStatus.is_running;

  return (
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
