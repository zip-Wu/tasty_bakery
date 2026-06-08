/**
 * 离线模拟数据
 * 当后端 API 连不上时，用这份本地数据渲染界面
 * 用于发预览二维码给设计师/测试人员时，他们也能看到完整界面
 *
 * 部署上线后可以删掉本文件，并在各页面去掉 mock 相关代码
 */

const PLACEHOLDER = '/images/mock/placeholder.png';

const mockProducts = [
  { id: 1,  name: '北海道吐司',   price: 28, image: PLACEHOLDER, category: '吐司', sales: 156 },
  { id: 2,  name: '法式可颂',     price: 15, image: PLACEHOLDER, category: '可颂', sales: 203 },
  { id: 3,  name: '全麦核桃包',   price: 22, image: PLACEHOLDER, category: '欧包', sales: 89 },
  { id: 4,  name: '芝士软欧',     price: 18, image: PLACEHOLDER, category: '欧包', sales: 134 },
  { id: 5,  name: '原味贝果',     price: 12, image: PLACEHOLDER, category: '贝果', sales: 78 },
  { id: 6,  name: '巧克力丹麦',   price: 20, image: PLACEHOLDER, category: '丹麦', sales: 112 },
  { id: 7,  name: '日式盐可颂',   price: 16, image: PLACEHOLDER, category: '可颂', sales: 156 },
  { id: 8,  name: '提拉米苏',     price: 32, image: PLACEHOLDER, category: '蛋糕', sales: 67 },
  { id: 9,  name: '蒜香法棍',     price: 14, image: PLACEHOLDER, category: '欧包', sales: 95 },
  { id: 10, name: '肉桂卷',       price: 18, image: PLACEHOLDER, category: '丹麦', sales: 143 },
  { id: 11, name: '抹茶红豆吐司', price: 26, image: PLACEHOLDER, category: '吐司', sales: 121 },
  { id: 12, name: '美式咖啡',     price: 20, image: PLACEHOLDER, category: '咖啡', sales: 210 },
];

const mockCategories = ['全部', '吐司', '可颂', '欧包', '贝果', '丹麦', '蛋糕', '咖啡'];

module.exports = { mockProducts, mockCategories };
