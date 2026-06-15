/**
 * 离线模拟数据 — 仅用于极端降级场景（后端完全不可用时）
 * 正式上线后可删除本文件
 */

const PLACEHOLDER = '/images/mock/placeholder.png';

const mockProducts = [
  { id: 1, name: '原味馒头', price: 8, image: PLACEHOLDER, category: '', sales: 0 },
];

const mockCategories = ['全部'];

module.exports = { mockProducts, mockCategories };
