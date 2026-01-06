import React, { useEffect, useState } from 'react';
import { Table, Tag, Image, Button, Input, Select, Space, Card, Row, Col, Tooltip, message, Modal, Form, InputNumber, Popconfirm, Tabs } from 'antd';
import { SearchOutlined, CopyOutlined, LinkOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

const { Option } = Select;

const ItemTable = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Initialize pagination from sessionStorage or default
  const [pagination, setPagination] = useState(() => {
    const saved = sessionStorage.getItem('itemTablePagination');
    return saved ? JSON.parse(saved) : { current: 1, pageSize: 50 };
  });

  // Filter & Sort State
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('update_time');
  const [sortOrder, setSortOrder] = useState('desc');

  // Settings State
  const [showImages, setShowImages] = useState(true);

  // Modal State
  // const [isModalVisible, setIsModalVisible] = useState(false);
  // const [editingItem, setEditingItem] = useState(null);
  // const [form] = Form.useForm();

  // Detail Modal State
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [priceHistory, setPriceHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Selection State
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Load Show Images
        try {
          const imgRes = await axios.get('/api/config/show_images');
          if (imgRes.data.value !== null) {
            setShowImages(imgRes.data.value !== 'false');
          } else {
             // Fallback to local storage if API returns null (not set yet)
             const savedShowImages = localStorage.getItem('show_images');
             if (savedShowImages !== null) {
               setShowImages(savedShowImages !== 'false');
             }
          }
        } catch (e) {
             // Fallback to local storage on error
             const savedShowImages = localStorage.getItem('show_images');
             if (savedShowImages !== null) {
               setShowImages(savedShowImages !== 'false');
             }
        }

        // Load Page Size
        try {
          const sizeRes = await axios.get('/api/config/table_page_size');
          if (sizeRes.data.value) {
            const size = parseInt(sizeRes.data.value);
            setPagination(prev => ({ ...prev, pageSize: size }));
          }
        } catch (e) {}
      } catch (error) {
        console.error(error);
      }
    };
    loadConfig();
  }, []);

  const fetchData = async (page = pagination.current, pageSize = pagination.pageSize, search = searchText, sort = sortBy, order = sortOrder) => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = {
        skip,
        limit: pageSize,
        sort_by: sort,
        order: order
      };

      if (search) {
        params.search = search;
      }

      const res = await axios.get('/api/items', { params });
      setData(res.data);

      const newPagination = { ...pagination, current: page, pageSize };
      setPagination(newPagination);
      sessionStorage.setItem('itemTablePagination', JSON.stringify(newPagination));

      // Clear selection on page change or refresh
      setSelectedRowKeys([]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchListings = async (goods_id) => {
    setListingsLoading(true);
    try {
      const res = await axios.get(`/api/items/${goods_id}/listings`);
      setListings(res.data);
    } catch (error) {
      message.error('获取详情失败');
    } finally {
      setListingsLoading(false);
    }
  };

  const fetchHistory = async (goods_id) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`/api/items/${goods_id}/history`);
      setPriceHistory(res.data);
    } catch (error) {
      message.error('获取历史价格失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  const showDetail = (item) => {
    setDetailItem(item);
    setIsDetailModalVisible(true);
    fetchListings(item.goods_id);
    fetchHistory(item.goods_id);
  };

  const handleDetailCancel = () => {
    setIsDetailModalVisible(false);
    setDetailItem(null);
    setListings([]);
    setPriceHistory([]);
  };

  useEffect(() => {
    fetchData(pagination.current, pagination.pageSize);
  }, []);

  const handleTableChange = (newPagination) => {
    fetchData(newPagination.current, newPagination.pageSize);
  };

  const onSelectChange = (newSelectedRowKeys) => {
    setSelectedRowKeys(newSelectedRowKeys);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
  };

  const handleBatchDelete = async () => {
    try {
      await axios.post('/api/items/batch_delete', selectedRowKeys);
      message.success(`成功删除 ${selectedRowKeys.length} 个商品`);
      fetchData(pagination.current, pagination.pageSize);
    } catch (error) {
      message.error('批量删除失败');
    }
  };

  const handleSearch = () => {
    fetchData(1, pagination.pageSize, searchText, sortBy, sortOrder);
  };

  const handleSortChange = (value) => {
    setSortBy(value);
    fetchData(1, pagination.pageSize, searchText, value, sortOrder);
  };

  const handleOrderChange = (value) => {
    setSortOrder(value);
    fetchData(1, pagination.pageSize, searchText, sortBy, value);
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link).then(() => {
      message.success('链接已复制');
    });
  };

  // CRUD Handlers
  /*
  const showModal = (item = null) => {
    setEditingItem(item);
    if (item) {
      form.setFieldsValue(item);
    } else {
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingItem(null);
    form.resetFields();
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        // Update
        await axios.put(`/api/items/${editingItem.goods_id}`, values);
        message.success('更新成功');
      } else {
        // Create
        await axios.post('/api/items', values);
        message.success('创建成功');
      }
      setIsModalVisible(false);
      fetchData(pagination.current, pagination.pageSize);
    } catch (error) {
      console.error(error);
      message.error('操作失败: ' + (error.response?.data?.detail || error.message));
    }
  };
  */

  const handleDelete = async (goods_id) => {
    try {
      await axios.delete(`/api/items/${goods_id}`);
      message.success('删除成功');
      fetchData(pagination.current, pagination.pageSize);
    } catch (error) {
      message.error('删除失败');
    }
  };

  const columns = [
    ...(showImages ? [{
      title: '商品',
      dataIndex: 'img',
      key: 'img',
      width: 80,
      render: (text) => <Image width={60} src={text} style={{ borderRadius: 4 }} preview={{ src: text }} />,
    }] : []),
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 300,
      render: (text, record) => (
        <div>
          <div
            style={{ fontWeight: 500, marginBottom: 4, cursor: 'pointer', color: '#1890ff' }}
            onClick={() => showDetail(record)}
          >
            {text}
          </div>
          <Space size="small">
             <Tag>{record.goods_id}</Tag>
          </Space>
        </div>
      )
    },
    {
      title: '价格信息',
      dataIndex: 'min_price',
      key: 'min_price',
      width: 200,
      render: (price, record) => {
        const discount = record.market_price > 0 ? ((price / record.market_price) * 10).toFixed(1) : '-';
        const diff = (record.market_price - price).toFixed(0);
        return (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f5222d' }}>
              ¥{price}
              <span style={{ fontSize: '12px', color: '#999', fontWeight: 'normal', marginLeft: 8, textDecoration: 'line-through' }}>
                ¥{record.market_price}
              </span>
            </div>
            <Space size="small" style={{ marginTop: 4 }}>
              <Tag color="green">{discount}折</Tag>
              {diff > 0 && <Tag color="red">省¥{diff}</Tag>}
            </Space>
          </div>
        );
      },
    },
    {
      title: '更新时间',
      dataIndex: 'update_time',
      key: 'update_time',
      width: 180,
      render: (text) => <div style={{ color: '#666' }}>{new Date(text).toLocaleString()}</div>,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="复制链接">
            <Button type="text" icon={<CopyOutlined />} onClick={() => copyLink(record.link)} size="small" />
          </Tooltip>
          <Tooltip title="跳转到B站">
            <Button type="text" icon={<LinkOutlined style={{ color: '#1890ff' }} />} href={record.link} target="_blank" size="small" />
          </Tooltip>
          {/*
          <Tooltip title="编辑">
            <Button type="text" icon={<EditOutlined />} onClick={() => showModal(record)} size="small" />
          </Tooltip>
          */}
          <Popconfirm title="确定删除吗?" onConfirm={() => handleDelete(record.goods_id)}>
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
        <Row gutter={16} align="middle">
          <Col xs={24} sm={8}>
            <Input
              placeholder="搜索商品名称..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              suffix={<SearchOutlined onClick={handleSearch} style={{ cursor: 'pointer', color: '#1890ff' }} />}
            />
          </Col>
          <Col xs={24} sm={16} style={{ textAlign: 'right' }}>
            <Space wrap>
              {selectedRowKeys.length > 0 && (
                <Popconfirm
                  title={`确定删除选中的 ${selectedRowKeys.length} 个商品吗?`}
                  onConfirm={handleBatchDelete}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    批量删除 ({selectedRowKeys.length})
                  </Button>
                </Popconfirm>
              )}
              {/*
              <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal(null)} style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}>
                新增商品
              </Button>
              */}
              <span style={{ color: '#666', marginLeft: 8 }}>排序:</span>
              <Select value={sortBy} style={{ width: 120 }} onChange={handleSortChange}>
                <Option value="update_time">更新时间</Option>
                <Option value="price">当前价格</Option>
                <Option value="discount">折扣力度</Option>
                <Option value="diff">降价金额</Option>
              </Select>
              <Select value={sortOrder} style={{ width: 100 }} onChange={handleOrderChange}>
                <Option value="desc">降序</Option>
                <Option value="asc">升序</Option>
              </Select>
              <Button type="primary" onClick={handleSearch} icon={<SearchOutlined />}>查询</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Table
        rowSelection={rowSelection}
        columns={columns}
        rowKey="goods_id"
        dataSource={data}
        pagination={{ ...pagination, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        loading={loading}
        onChange={handleTableChange}
        scroll={{ x: 1000 }}
      />

      {/*
      <Modal
        title={editingItem ? "编辑商品" : "新增商品"}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="goods_id"
            label="商品ID (Goods ID)"
            rules={[{ required: true, message: '请输入商品ID' }]}
          >
            <InputNumber style={{ width: '100%' }} disabled={!!editingItem} />
          </Form.Item>
          <Form.Item
            name="name"
            label="商品名称"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="img"
            label="图片链接"
            rules={[{ required: true, message: '请输入图片链接' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="market_price"
            label="市场价"
            rules={[{ required: true, message: '请输入市场价' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item
            name="min_price"
            label="当前价格"
            rules={[{ required: true, message: '请输入当前价格' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>
      */}

      <Modal
        title={detailItem ? detailItem.name : "商品详情"}
        open={isDetailModalVisible}
        onCancel={handleDetailCancel}
        footer={null}
        width={800}
        destroyOnClose
      >
        {detailItem && (
          <div>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Image src={detailItem.img} />
              </Col>
              <Col span={16}>
                <p><strong>商品ID:</strong> {detailItem.goods_id}</p>
                <p><strong>市场价:</strong> ¥{detailItem.market_price}</p>
                <p><strong>当前最低价:</strong> <span style={{ color: 'red', fontSize: 18, fontWeight: 'bold' }}>¥{detailItem.min_price}</span></p>
                <p><strong>更新时间:</strong> {new Date(detailItem.update_time).toLocaleString()}</p>
              </Col>
            </Row>

            <h3>在售列表 (按价格排序)</h3>
            <Table
              dataSource={listings}
              rowKey="c2c_id"
              loading={listingsLoading}
              pagination={{ pageSize: 10 }}
              size="small"
              columns={[
                {
                  title: '价格',
                  dataIndex: 'price',
                  key: 'price',
                  render: (price) => <span style={{ color: 'red', fontWeight: 'bold' }}>¥{price}</span>,
                  sorter: (a, b) => a.price - b.price,
                },
                {
                  title: '更新时间',
                  dataIndex: 'update_time',
                  key: 'update_time',
                  render: (text) => new Date(text).toLocaleString(),
                },
                {
                  title: '操作',
                  key: 'action',
                  render: (_, record) => {
                    const link = `https://mall.bilibili.com/neul-next/index.html?page=magic-market_detail&noTitleBar=1&itemsId=${record.c2c_id}&from=market_index`;
                    return (
                      <Button type="primary" size="small" href={link} target="_blank">
                        购买/查看
                      </Button>
                    );
                  }
                }
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ItemTable;
