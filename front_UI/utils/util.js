/**
 * 工具函数 — 时间格式化、数字补零
 */

/**
 * 将 Date 对象格式化为 "YYYY/MM/DD HH:MM:SS" 字符串
 * @param {Date} date - JavaScript Date 对象
 * @returns {string} 格式化后的时间字符串，如 "2025/07/13 16:57:50"
 */
const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

/**
 * 个位数前置补零（0-9 → "00"-"09"，10+ 不变）
 * @param {number} n - 待补零的数字
 * @returns {string} 补零后的两位字符串
 */
const formatNumber = n => {
  n = n.toString()
  // n[1] 存在 → n ≥ 10（如 "12"[1] = "2"），无需补零；否则补零
  return n[1] ? n : `0${n}`
}

module.exports = {
  formatTime
}
