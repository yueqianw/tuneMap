/**
 * 音乐生成API服务调用 - 带调试版本
 */

// 从环境变量获取API基础URL，默认为Google Cloud Run部署的服务
const API_BASE_URL = import.meta.env.VITE_API_URL;

console.log('API_BASE_URL:', API_BASE_URL); // 调试：显示使用的API地址

/**
 * 生成音乐
 * @param {File[]} images - 图片文件数组
 * @param {number[]} coords  - 坐标对象 {latitude, longitude}
 * @param {Object} options - 可选参数
 * @param {string} options.style - 音乐风格
 * @param {boolean} options.refineDescription - 是否精炼场景描述
 * @returns {Promise<Blob>} - 返回音频文件Blob
 */
export async function generateMusic(images, coords, options = {}) {
  console.log('generateMusic 被调用，参数：', {
    imagesCount: images.length,
    coords,
    options
  });

  try {
    // 创建FormData对象
    const formData = new FormData();
    
    // 添加图片文件
    images.forEach((image, index) => {
      console.log(`添加图片 ${index + 1}:`, image.name, image.size, 'bytes');
      formData.append('images', image);
    });
    
    // 添加坐标

    formData.append('latitude', coords[0]);  // coords[0] 是 latitude
    formData.append('longitude', coords[1]); // coords[1] 是 longitude
    
    // 添加可选参数
    if (options.style) {
      formData.append('style', options.style);
    }
    
    formData.append('refine_description', options.refineDescription !== false);
    
    const requestUrl = `${API_BASE_URL}/api/generate-music`;
    console.log('发送请求到:', requestUrl);
    
    // 发送请求
    const response = await fetch(requestUrl, {
      method: 'POST',
      body: formData,
      // 不设置Content-Type，让浏览器自动设置multipart/form-data和boundary
      // 添加超时处理，因为音乐生成可能需要较长时间
      // signal: AbortSignal.timeout(120000), // 2分钟超时
    });
    
    console.log('收到响应:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    // 检查响应状态
    if (!response.ok) {
      console.error('请求失败，状态码:', response.status);
      // 尝试解析错误消息
      try {
        const errorData = await response.json();
        console.error('服务器错误详情:', errorData);
        throw new Error(errorData.error || `服务器返回错误: ${response.status}`);
      } catch (e) {
        console.error('解析错误响应失败:', e);
        // 如果无法解析JSON，可能是网络错误或其他问题
        if (e.name === 'SyntaxError') {
          throw new Error(`服务器返回错误: ${response.status} - ${response.statusText}`);
        }
        throw e;
      }
    }
    
    // 检查响应类型
    const contentType = response.headers.get('Content-Type');
    console.log('响应内容类型:', contentType);
    if (!contentType || !contentType.includes('audio')) {
      console.warn('警告: 响应可能不是音频文件，Content-Type:', contentType);
    }
    
    // 返回音频Blob
    const blob = await response.blob();
    console.log('成功获取音频Blob，大小:', blob.size, 'bytes');
    return blob;
  } catch (error) {
    console.error('generateMusic 发生错误:', error);
    if (error.name === 'TimeoutError') {
      throw new Error('请求超时，音乐生成时间过长，请稍后重试');
    }
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      throw new Error('网络连接失败，请检查网络或服务器状态');
    }
    throw error;
  }
}

/**
 * 检查API服务器健康状态
 * @returns {Promise<boolean>} - 服务器是否健康
 */
export async function checkApiHealth() {
  const healthUrl = `${API_BASE_URL}/api/health`;
  console.log('检查API健康状态:', healthUrl);
  
  try {
    const response = await fetch(healthUrl, {
      // 健康检查使用较短的超时时间
      signal: AbortSignal.timeout(10000), // 10秒超时
    });
    
    console.log('健康检查响应:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (response.ok) {
      try {
        const data = await response.json();
        console.log('健康检查响应数据:', data);
      } catch (e) {
        console.log('健康检查响应不是JSON格式');
      }
    }
    
    return response.ok;
  } catch (error) {
    console.error('API服务器健康检查失败:', error);
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.error('网络连接失败 - 可能的原因：');
      console.error('1. 服务器未运行');
      console.error('2. 网络连接问题');
      console.error('3. CORS配置问题');
      console.error('4. URL地址错误');
    }
    return false;
  }
}

/**
 * 测试API连接的调试函数
 */
export async function debugApiConnection() {
  console.log('=== API连接调试开始 ===');
  console.log('API基础URL:', API_BASE_URL);
  
  // 测试基础连接
  try {
    console.log('测试基础连接...');
    const response = await fetch(API_BASE_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    console.log('基础连接响应:', response.status, response.statusText);
  } catch (error) {
    console.error('基础连接失败:', error.message);
  }
  
  // 测试健康检查端点
  const isHealthy = await checkApiHealth();
  console.log('健康检查结果:', isHealthy);
  
  console.log('=== API连接调试结束 ===');
  return isHealthy;
}