/**
 * 音乐生成API服务调用
 */

// 从环境变量获取API基础URL，默认为本地开发服务器
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * 生成音乐
 * @param {File[]} images - 图片文件数组
 * @param {Object} coordinates - 坐标对象 {latitude, longitude}
 * @param {Object} options - 可选参数
 * @param {string} options.style - 音乐风格
 * @param {boolean} options.refineDescription - 是否精炼场景描述
 * @returns {Promise<Blob>} - 返回音频文件Blob
 */
export async function generateMusic(images, coordinates, options = {}) {
  try {
    // 创建FormData对象
    const formData = new FormData();
    
    // 添加图片文件
    images.forEach(image => {
      formData.append('images', image);
    });
    
    // 添加坐标
    formData.append('latitude', coordinates.latitude);
    formData.append('longitude', coordinates.longitude);
    
    // 添加可选参数
    if (options.style) {
      formData.append('style', options.style);
    }
    
    formData.append('refine_description', options.refineDescription !== false);
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/api/generate-music`, {
      method: 'POST',
      body: formData,
      // 不设置Content-Type，让浏览器自动设置multipart/form-data和boundary
    });
    
    // 检查响应状态
    if (!response.ok) {
      // 尝试解析错误消息
      try {
        const errorData = await response.json();
        throw new Error(errorData.error || `服务器返回错误: ${response.status}`);
      } catch (e) {
        throw new Error(`服务器返回错误: ${response.status}`);
      }
    }
    
    // 返回音频Blob
    return await response.blob();
  } catch (error) {
    console.error('生成音乐失败:', error);
    throw error;
  }
}

/**
 * 检查API服务器健康状态
 * @returns {Promise<boolean>} - 服务器是否健康
 */
export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    return response.ok;
  } catch (error) {
    console.error('API服务器健康检查失败:', error);
    return false;
  }
}