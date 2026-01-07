import React, { useEffect, useState } from 'react';
import { Form, Input, Button, message, Card, Checkbox, Divider, InputNumber, Switch, Select, Row, Col, Tooltip, Typography, Alert, Space } from 'antd';
import { EyeOutlined, SafetyCertificateOutlined, DashboardOutlined, FilterOutlined, QuestionCircleOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { Title, Text } = Typography;

const Settings = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const priceOptions = [
    { label: '0-20元', value: '0-2000' },
    { label: '20-30元', value: '2000-3000' },
    { label: '30-50元', value: '3000-5000' },
    { label: '50-100元', value: '5000-10000' },
    { label: '100-200元', value: '10000-20000' },
    { label: '200元以上', value: '20000-0' },
  ];

  const categoryOptions = [
    { label: '全部 (All)', value: '' },
    { label: '手办 (2312)', value: '2312' },
    { label: '模型 (2066)', value: '2066' },
    { label: '周边 (2331)', value: '2331' },
    { label: '3C (2273)', value: '2273' },
    { label: '福袋 (fudai_cate_id)', value: 'fudai_cate_id' },
  ];

  const fetchConfig = async () => {
    try {
      // Fetch Show Images
      try {
        const imgRes = await axios.get('/api/config/show_images');
        const showImages = imgRes.data.value !== 'false';
        form.setFieldsValue({ show_images: showImages });
        // Sync to local storage
        localStorage.setItem('show_images', showImages ? 'true' : 'false');
      } catch (e) {
        // Fallback to local storage
        const savedShowImages = localStorage.getItem('show_images');
        const showImages = savedShowImages === 'false' ? false : true;
        form.setFieldsValue({ show_images: showImages });
      }

      // Fetch Cookie
      try {
        const cookieRes = await axios.get('/api/config/user_cookie');
        form.setFieldsValue({ user_cookie: cookieRes.data.value });
      } catch (e) {}

      // Fetch Rate Limit
      try {
        const intervalRes = await axios.get('/api/config/request_interval');
        form.setFieldsValue({ request_interval: intervalRes.data.value });
      } catch (e) {
        form.setFieldsValue({ request_interval: 3 });
      }

      // Fetch Schedule Interval
      try {
        const scheduleRes = await axios.get('/api/config/scrape_interval_minutes');
        form.setFieldsValue({ scrape_interval_minutes: scheduleRes.data.value });
      } catch (e) {
        form.setFieldsValue({ scrape_interval_minutes: 60 });
      }

      // Fetch Max Pages
      try {
        const pagesRes = await axios.get('/api/config/auto_scrape_max_pages');
        form.setFieldsValue({ auto_scrape_max_pages: pagesRes.data.value });
      } catch (e) {
        form.setFieldsValue({ auto_scrape_max_pages: 50 });
      }

      // Fetch Page Size
      try {
        const pageSizeRes = await axios.get('/api/config/table_page_size');
        form.setFieldsValue({ table_page_size: pageSizeRes.data.value });
      } catch (e) {
        form.setFieldsValue({ table_page_size: 50 });
      }

      // Fetch Filters
      try {
        const filterRes = await axios.get('/api/config/filter_settings');
        const settings = JSON.parse(filterRes.data.value);
        form.setFieldsValue({
          category: settings.category || "2312",
          priceFilters: settings.priceFilters || []
        });
      } catch (e) {
        form.setFieldsValue({
          category: "2312",
          priceFilters: ["0-2000", "3000-5000", "20000-0", "5000-10000", "2000-3000", "10000-20000", "20000-0"]
        });
      }

    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      // Save Show Images
      const showImagesStr = values.show_images ? 'true' : 'false';
      await axios.post('/api/config', { key: 'show_images', value: showImagesStr });
      localStorage.setItem('show_images', showImagesStr);

      // Save Cookie
      await axios.post('/api/config', { key: 'user_cookie', value: values.user_cookie });

      // Save Rate Limit
      await axios.post('/api/config', { key: 'request_interval', value: String(values.request_interval) });

      // Save Schedule Interval
      await axios.post('/api/config', { key: 'scrape_interval_minutes', value: String(values.scrape_interval_minutes) });

      // Save Max Pages
      await axios.post('/api/config', { key: 'auto_scrape_max_pages', value: String(values.auto_scrape_max_pages) });

      // Save Page Size
      await axios.post('/api/config', { key: 'table_page_size', value: String(values.table_page_size) });

      // Save Filters
      const filterSettings = {
        category: values.category,
        priceFilters: values.priceFilters
      };
      await axios.post('/api/config', { key: 'filter_settings', value: JSON.stringify(filterSettings) });

      message.success('配置更新成功');
    } catch (error) {
      message.error('配置更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Row gutter={[16, 16]}>
          {/* Left Column: Authentication & Display */}
          <Col xs={24} lg={10}>
            <Card
              title={<Space><SafetyCertificateOutlined /> 身份认证</Space>}
              style={{ marginBottom: 16 }}
              headStyle={{ backgroundColor: '#fafafa' }}
            >
              <Alert
                message="Cookie 获取指南"
                description={
                  <ol style={{ fontSize: '12px', paddingLeft: '20px', margin: 0 }}>
                    <li>访问 <a href="https://mall.bilibili.com/neul-next/index.html?page=magic-market_index" target="_blank" rel="noopener noreferrer">Bilibili 魔力赏市场</a> 并登录。</li>
                    <li>按 <code>F12</code> 打开开发者工具，切换到 <strong>Network</strong> 标签页。</li>
                    <li>刷新页面，找到 <code>list</code> 请求。</li>
                    <li>复制 Request Headers 中的 <code>cookie</code> 值。</li>
                  </ol>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Form.Item
                name="user_cookie"
                label="Bilibili Cookie"
                rules={[{ required: true, message: '请输入您的 Cookie' }]}
              >
                <Input.TextArea
                  rows={5}
                  placeholder="buvid3=...; SESSDATA=...;"
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
              </Form.Item>
            </Card>

            <Card
              title={<Space><EyeOutlined /> 显示设置</Space>}
              headStyle={{ backgroundColor: '#fafafa' }}
            >
              <Row justify="space-between" align="middle">
                <Col>
                  <Form.Item
                    name="show_images"
                    label="加载商品图片"
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                </Col>
                <Col>
                  <Text type="secondary" style={{ fontSize: 12 }}>关闭图片可节省流量并提高流畅度</Text>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Right Column: Crawler & Filters */}
          <Col xs={24} lg={14}>
            <Card
              title={<Space><DashboardOutlined /> 爬虫控制</Space>}
              style={{ marginBottom: 16 }}
              headStyle={{ backgroundColor: '#fafafa' }}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="request_interval"
                    label={
                      <Space>
                        请求间隔 (秒)
                        <Tooltip title="每次向 Bilibili 发送 HTTP 请求之间的等待时间。如果遇到 IP 封禁，请增加此值。">
                          <QuestionCircleOutlined style={{ color: '#999' }} />
                        </Tooltip>
                      </Space>
                    }
                    rules={[{ required: true, message: '请输入请求间隔' }]}
                  >
                    <InputNumber min={1} max={60} step={0.5} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="scrape_interval_minutes"
                    label={
                      <Space>
                        自动爬取间隔 (分钟)
                        <Tooltip title="后台自动爬虫运行的频率。">
                          <QuestionCircleOutlined style={{ color: '#999' }} />
                        </Tooltip>
                      </Space>
                    }
                    rules={[{ required: true, message: '请输入自动爬取间隔' }]}
                  >
                    <InputNumber min={5} max={1440} step={5} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="auto_scrape_max_pages"
                    label={
                      <Space>
                        自动爬取最大页数
                        <Tooltip title="每次自动爬取时扫描的最大页数。">
                          <QuestionCircleOutlined style={{ color: '#999' }} />
                        </Tooltip>
                      </Space>
                    }
                    rules={[{ required: true, message: '请输入最大页数' }]}
                  >
                    <InputNumber min={1} max={500} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="table_page_size"
                    label="列表每页显示数量"
                    rules={[{ required: true, message: '请输入每页数量' }]}
                  >
                    <InputNumber min={10} max={500} step={10} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card
              title={<Space><FilterOutlined /> 搜索筛选</Space>}
              headStyle={{ backgroundColor: '#fafafa' }}
            >
              <Form.Item
                name="category"
                label={
                  <Space>
                    搜索分类
                    <Tooltip title="选择要爬取的商品分类。如果选择“全部”，爬虫每次运行时会随机选择一个分类进行抓取，从而实现全覆盖。">
                      <QuestionCircleOutlined style={{ color: '#999' }} />
                    </Tooltip>
                  </Space>
                }
                rules={[{ required: false }]}
              >
                <Select options={categoryOptions} placeholder="请选择搜索分类" allowClear />
              </Form.Item>

              <Form.Item
                name="priceFilters"
                label="价格区间"
              >
                <Checkbox.Group options={priceOptions} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }} />
              </Form.Item>
            </Card>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Button type="primary" htmlType="submit" loading={loading} size="large" icon={<SaveOutlined />}>
                保存所有配置
              </Button>
            </div>
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default Settings;
