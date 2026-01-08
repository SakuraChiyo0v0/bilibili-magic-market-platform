import React, { useEffect, useState } from 'react';
import { Table, Tag, Image, Button, Input, Select, Space, Card, Row, Col, Tooltip, App, Modal, Form, InputNumber, Popconfirm, Tabs, Switch } from 'antd';
import { SearchOutlined, CopyOutlined, LinkOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PictureOutlined, HeartOutlined, HeartFilled, SyncOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

const { Option } = Select;

const ItemTable = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const location = useLocation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState([]); // List of favorited goods_ids
  // Initialize onlyFavorites from navigation state if available
  const [onlyFavorites, setOnlyFavorites] = useState(location.state?.onlyFavorites || false);

  const [checkLoading, setCheckLoading] = useState(false);

  // Initialize pagination from sessionStorage or default
  const [pagination, setPagination] = useState(() => {
    const saved = sessionStorage.getItem('itemTablePagination');
    return saved ? JSON.parse(saved) : { current: 1, pageSize: 50 };
  });

  // Filter & Sort State
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [sortBy, setSortBy] = useState('update_time');
  const [sortOrder, setSortOrder] = useState('desc');

  // Settings State
  const [showImages, setShowImages] = useState(true);

  // Category Map
  const categoryMap = {
    '2312': '手办',
    '2066': '模型',
    '2331': '周边',
    '2273': '3C',
    'fudai_cate_id': '福袋'
  };

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

  const fetchFavorites = async () => {
    if (!user) return;
    try {
      const res = await axios.get('/api/favorites/ids');
      setFavorites(res.data);
    } catch (error) {
      console.error("Failed to fetch favorites", error);
    }
  };

  const toggleFavorite = async (goods_id) => {
    try {
      const res = await axios.post(`/api/favorites/${goods_id}`);
      if (res.data.is_favorite) {
        setFavorites(prev => [...prev, goods_id]);
        message.success('已收藏');
      } else {
        setFavorites(prev => prev.filter(id => id !== goods_id));
        message.success('已取消收藏');
      }
    } catch (error) {
      message.error('操作失败');
    }
  };

  useEffect(() => {
    const init = async () => {
      let currentShowImages = true;
      let currentPageSize = 50;
      let currentPage = 1;

      // 0. Fetch Favorites
      fetchFavorites();

      // 1. Load Config
      try {
        // Load Show Images
        try {
          const imgRes = await axios.get('/api/config/show_images');
          if (imgRes.data.value !== null) {
            currentShowImages = imgRes.data.value !== 'false';
          } else {
             const savedShowImages = localStorage.getItem('show_images');
             if (savedShowImages !== null) {
               currentShowImages = savedShowImages !== 'false';
             }
          }
        } catch (e) {
             const savedShowImages = localStorage.getItem('show_images');
             if (savedShowImages !== null) {
               currentShowImages = savedShowImages !== 'false';
             }
        }
        setShowImages(currentShowImages);

        // Load Page Size
        try {
          const sizeRes = await axios.get('/api/config/table_page_size');
          if (sizeRes.data.value) {
            currentPageSize = parseInt(sizeRes.data.value);
            setPagination(prev => ({ ...prev, pageSize: currentPageSize }));
          }
        } catch (e) {}

        // Load Current Page
        try {
          const pageRes = await axios.get('/api/config/table_current_page');
          if (pageRes.data.value) {
            // If we are filtering by favorites (e.g. from Dashboard), force page 1
            if (location.state?.onlyFavorites) {
                currentPage = 1;
            } else {
                currentPage = parseInt(pageRes.data.value);
            }
            setPagination(prev => ({ ...prev, current: currentPage }));
          }
        } catch (e) {}

      } catch (error) {
        console.error(error);
      }

      // 2. Fetch Data
      // Use the current state value which is initialized from location.state
      fetchData(currentPage, currentPageSize, searchText, categoryFilter, sortBy, sortOrder, onlyFavorites);
    };

    init();
  }, []);

  const fetchData = async (page = pagination.current, pageSize = pagination.pageSize, search = searchText, category = categoryFilter, sort = sortBy, order = sortOrder, onlyFav = onlyFavorites) => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const params = {
        skip,
        limit: pageSize,
        sort_by: sort,
        order: order,
        only_favorites: onlyFav
      };

      if (search) {
        params.search = search;
      }

      if (category && category.length > 0) {
        params.category = Array.isArray(category) ? category.join(',') : category;
      }

      const res = await axios.get('/api/items', { params });
      setData(res.data.items);

      const newPagination = { ...pagination, current: page, pageSize, total: res.data.total };
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
      // 1. Load existing data immediately
      const res = await axios.get(`/api/items/${goods_id}/listings`);
      setListings(res.data);
      setListingsLoading(false); // Stop loading spinner so user can see data

      // 2. Check config to see if we should trigger validity check
      try {
          const configRes = await axios.get('/api/config/check_validity_on_click');
          const shouldCheck = configRes.data.value === 'true';

          if (shouldCheck) {
              // Trigger validity check in background
              const checkRes = await axios.post(`/api/items/${goods_id}/check_validity`);
              if (checkRes.data.removed > 0) {
                  message.info(`已自动清理 ${checkRes.data.removed} 个失效链接，正在刷新...`);
                  // 3. Reload data if changes occurred
                  const newRes = await axios.get(`/api/items/${goods_id}/listings`);
                  setListings(newRes.data);
              }
          }
      } catch (e) {
          console.error("Validity check failed", e);
      }
    } catch (error) {
      message.error('获取详情失败');
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

  const handleCheckDetailValidity = async () => {
    if (!detailItem) return;
    setListingsLoading(true);
    try {
      const res = await axios.post(`/api/items/${detailItem.goods_id}/check_validity`);
      message.success(`检查完成，清理了 ${res.data.removed} 个失效链接`);
      // Refresh detail data
      fetchListings(detailItem.goods_id);
      // Also refresh main table data to update min_price if changed
      fetchData(pagination.current, pagination.pageSize, searchText, categoryFilter, sortBy, sortOrder, onlyFavorites);

      // Update detailItem min_price locally if needed (optional, but good for UX)
      // Actually fetchListings updates listings, but detailItem is state.
      // We should probably re-fetch the product info too, but for now let's just refresh listings.
    } catch (error) {
      message.error('检查失败');
      setListingsLoading(false);
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

  const handleTableChange = (newPagination) => {
    fetchData(newPagination.current, newPagination.pageSize);
    // Save current page to DB
    axios.post('/api/config', { key: 'table_current_page', value: String(newPagination.current) }).catch(console.error);

    // Save page size to DB if changed
    if (newPagination.pageSize !== pagination.pageSize) {
      axios.post('/api/config', { key: 'table_page_size', value: String(newPagination.pageSize) }).catch(console.error);
    }
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

  const handleCheckFavorites = async () => {
    setCheckLoading(true);
    try {
      // Send empty object as body to avoid 422 error
      const res = await axios.post('/api/favorites/check', {});
      message.success(res.data.message);
      // Refresh data after a short delay to allow background task to start/finish some items
      setTimeout(() => {
        fetchData(pagination.current, pagination.pageSize, searchText, categoryFilter, sortBy, sortOrder, onlyFavorites);
      }, 2000);
    } catch (error) {
      message.error('检查请求失败');
    } finally {
      setCheckLoading(false);
    }
  };

  const handleSearch = () => {
    // Reset to page 1 when searching
    fetchData(1, pagination.pageSize, searchText, categoryFilter, sortBy, sortOrder, onlyFavorites);
  };

  const handleCategoryChange = (value) => {
    setCategoryFilter(value);
    fetchData(1, pagination.pageSize, searchText, value, sortBy, sortOrder, onlyFavorites);
  };

  const handleSortChange = (value) => {
    setSortBy(value);
    fetchData(1, pagination.pageSize, searchText, categoryFilter, value, sortOrder, onlyFavorites);
  };

  const handleOrderChange = (value) => {
    setSortOrder(value);
    fetchData(1, pagination.pageSize, searchText, categoryFilter, sortBy, value, onlyFavorites);
  };

  const handleOnlyFavoritesChange = (checked) => {
    setOnlyFavorites(checked);
    // Reset to page 1 when toggling favorites
    fetchData(1, pagination.pageSize, searchText, categoryFilter, sortBy, sortOrder, checked);
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

  /*
  const handleRecalcPrice = async (goods_id) => {
    try {
      await axios.post(`/api/items/${goods_id}/recalc`);
      message.success('价格已修正');
      // Refresh current page
      fetchData(pagination.current, pagination.pageSize, searchText, categoryFilter, sortBy, sortOrder, onlyFavorites);
    } catch (error) {
      message.error('修正失败');
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
      title: '',
      key: 'favorite',
      width: 40,
      align: 'center',
      render: (_, record) => {
        const isFav = favorites.includes(record.goods_id);
        return (
          <Button
            type="text"
            icon={isFav ? <HeartFilled style={{ color: '#eb2f96' }} /> : <HeartOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(record.goods_id);
            }}
          />
        );
      }
    },
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
             {record.category && categoryMap[String(record.category)] && (
               <Tag color="blue">{categoryMap[String(record.category)]}</Tag>
             )}
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
        const isOutOfStock = record.is_out_of_stock;

        return (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: isOutOfStock ? '#999' : '#f5222d' }}>
              {isOutOfStock ? '暂无报价' : `¥${price}`}
              <span style={{ fontSize: '12px', color: '#999', fontWeight: 'normal', marginLeft: 8, textDecoration: 'line-through' }}>
                ¥{record.market_price}
              </span>
            </div>
            <Space size="small" style={{ marginTop: 4 }}>
              {isOutOfStock ? (
                <Tag color="default">无货</Tag>
              ) : (
                <>
                  <Tag color="green">{discount}折</Tag>
                  {diff > 0 && <Tag color="red">省¥{diff}</Tag>}
                </>
              )}
              {record.historical_low_price && (record.is_out_of_stock || record.min_price > record.historical_low_price) && (
                <Tooltip title="历史最低价">
                  <Tag color="gold">史低: ¥{record.historical_low_price}</Tag>
                </Tooltip>
              )}
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
            <Button type="text" icon={<LinkOutlined style={{ color: '#1890ff' }} />} href={record.link} target="_blank" size="small" disabled={!record.link} />
          </Tooltip>
          {/*
          <Tooltip title="修正价格 (基于数据库)">
            <Button type="text" icon={<ToolOutlined />} onClick={() => handleRecalcPrice(record.goods_id)} size="small" />
          </Tooltip>
          */}
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
              onChange={e => {
                setSearchText(e.target.value);
                if (e.target.value === '') {
                    // Auto-search (reset) when cleared
                    fetchData(1, pagination.pageSize, '', categoryFilter, sortBy, sortOrder, onlyFavorites);
                }
              }}
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
              <span style={{ color: '#666', marginLeft: 8 }}>分类:</span>
              <Select
                mode="multiple"
                value={categoryFilter}
                style={{ minWidth: 120, maxWidth: 300 }}
                onChange={handleCategoryChange}
                allowClear
                placeholder="全部"
                maxTagCount="responsive"
              >
                {Object.entries(categoryMap).map(([key, label]) => (
                  <Option key={key} value={key}>{label}</Option>
                ))}
              </Select>
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
              {user && (
                <Space style={{ marginLeft: 16 }}>
                  <span style={{ color: '#666' }}>只看关注:</span>
                  <Switch checked={onlyFavorites} onChange={handleOnlyFavoritesChange} />
                  {onlyFavorites && (
                    <Tooltip title="检查所有关注商品的链接有效性（后台运行）">
                      <Button
                        icon={<SyncOutlined />}
                        onClick={handleCheckFavorites}
                        loading={checkLoading}
                      >
                        检查有效性
                      </Button>
                    </Tooltip>
                  )}
                </Space>
              )}
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
                <p>
                  <strong>当前最低价:</strong>{' '}
                  {detailItem.is_out_of_stock ? (
                    <Tag color="default">无货</Tag>
                  ) : (
                    <span style={{ color: '#f5222d', fontSize: 18, fontWeight: 'bold' }}>¥{detailItem.min_price}</span>
                  )}
                  <Tooltip title="立即检查挂单有效性">
                    <Button
                      type="link"
                      icon={<SyncOutlined />}
                      size="small"
                      onClick={handleCheckDetailValidity}
                      loading={listingsLoading}
                    >
                      刷新
                    </Button>
                  </Tooltip>
                </p>
                {detailItem.historical_low_price && (
                  <p>
                    <strong>历史最低价:</strong>{' '}
                    <span style={{ color: '#faad14', fontWeight: 'bold' }}>¥{detailItem.historical_low_price}</span>
                  </p>
                )}
                <p><strong>更新时间:</strong> {new Date(detailItem.update_time).toLocaleString()}</p>
              </Col>
            </Row>

            <h3>价格趋势</h3>
            <div style={{ height: 200, marginBottom: 24 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis
                    dataKey="record_time"
                    tickFormatter={(time) => new Date(time).toLocaleDateString()}
                    stroke="#999"
                    fontSize={12}
                  />
                  <YAxis stroke="#999" fontSize={12} />
                  <RechartsTooltip
                    labelFormatter={(time) => new Date(time).toLocaleString()}
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #ccc', borderRadius: 4 }}
                  />
                  <Line type="stepAfter" dataKey="price" stroke="#1890ff" dot={false} strokeWidth={2} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <h3>在售列表 (最低价前5)</h3>
            <Table
              dataSource={listings.slice(0, 5)}
              rowKey="c2c_id"
              loading={listingsLoading}
              pagination={false}
              size="small"
              locale={{ emptyText: '当前暂无有效在售商品，可能已被抢光或链接失效。' }}
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
