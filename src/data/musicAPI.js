// src/data/musicApi.js
const API_BASE_URL = import.meta.env.VITE_APP_API_URL;

// 通用请求封装
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    throw error;
  }
}

// 音乐生成API - 简化版本，专注于数据传输
export const musicApi = {
  /**
   * 上传图片文件
   * @param {File[]} images - 图片文件数组
   * @returns {Promise<Object>} 上传结果，包含图片路径数组
   */
  uploadImages: async (images) => {
    if (!images || !Array.isArray(images) || images.length === 0) {
      throw new Error('请选择至少一张图片');
    }

    // 验证文件
    utils.validateImageFiles(images);

    // 创建 FormData
    const formData = new FormData();
    images.forEach((image) => {
      formData.append('images', image);
    });
    
    const url = `${API_BASE_URL}/api/upload-images`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Image upload failed:', error);
      throw error;
    }
  },

  /**
   * 创建音乐生成任务
   * @param {Object} params - 参数对象
   * @param {string[]} params.imagePaths - 图片路径数组
   * @param {string} params.location - 位置信息
   * @param {string} params.userId - 用户ID (可选)
   * @returns {Promise<Object>} 任务创建结果
   */
  createMusicTask: async ({ imagePaths, location, userId }) => {
    if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
      throw new Error('图片路径不能为空');
    }
    
    if (!location || typeof location !== 'string') {
      throw new Error('位置信息不能为空');
    }

    return apiRequest('/api/generate-music', {
      method: 'POST',
      body: JSON.stringify({
        image_paths: imagePaths,
        location: location,
        user_id: userId,
      }),
    });
  },

  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {Promise<Object>} 任务状态信息
   */
  getTaskStatus: async (taskId) => {
    return apiRequest(`/api/task-status/${taskId}`);
  },

  /**
   * 获取任务列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 任务列表
   */
  getTasks: async ({ status, limit = 10, offset = 0, userId } = {}) => {
    const queryParams = new URLSearchParams();
    
    if (status) queryParams.append('status', status);
    if (userId) queryParams.append('user_id', userId);
    queryParams.append('limit', limit.toString());
    queryParams.append('offset', offset.toString());
    
    const queryString = queryParams.toString();
    const endpoint = `/api/tasks${queryString ? `?${queryString}` : ''}`;
    
    return apiRequest(endpoint);
  },

  /**
   * 删除任务
   * @param {string} taskId - 任务ID
   * @returns {Promise<Object>} 删除结果
   */
  deleteTask: async (taskId) => {
    return apiRequest(`/api/task/${taskId}`, {
      method: 'DELETE',
    });
  },

  /**
   * 健康检查
   * @returns {Promise<Object>} 健康状态
   */
  healthCheck: async () => {
    return apiRequest('/health');
  },

  /**
   * 轮询任务状态直到完成
   * @param {string} taskId - 任务ID
   * @param {Object} options - 轮询选项
   * @returns {Promise<Object>} 最终任务状态
   */
  pollTaskStatus: async (taskId, { 
    interval = 3000, 
    maxAttempts = 100, // 5分钟超时
    onUpdate 
  } = {}) => {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const status = await musicApi.getTaskStatus(taskId);
        
        // 调用更新回调
        if (onUpdate && typeof onUpdate === 'function') {
          onUpdate(status);
        }
        
        // 检查是否完成
        if (status.status === 'completed') {
          return status;
        }
        
        // 检查是否失败
        if (status.status === 'failed') {
          throw new Error(status.error_message || 'Task failed');
        }
        
        // 等待下次轮询
        await new Promise(resolve => setTimeout(resolve, interval));
        attempts++;
        
      } catch (error) {
        console.error('Polling error:', error);
        
        // 如果是网络错误，继续重试
        if (attempts < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, interval));
          attempts++;
          continue;
        }
        
        throw error;
      }
    }
    
    throw new Error('Task polling timeout');
  },
};

// 任务状态常量
export const TASK_STATUS = {
  PENDING: 'pending',
  ANALYZING: 'analyzing', 
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// 任务状态显示文本
export const TASK_STATUS_TEXT = {
  [TASK_STATUS.PENDING]: '等待中',
  [TASK_STATUS.ANALYZING]: '分析中',
  [TASK_STATUS.GENERATING]: '生成中',
  [TASK_STATUS.COMPLETED]: '已完成',
  [TASK_STATUS.FAILED]: '失败',
};

// 获取状态消息
export function getStatusMessage(status) {
  const messages = {
    [TASK_STATUS.PENDING]: '任务排队中，请稍候...',
    [TASK_STATUS.ANALYZING]: '正在分析图片和位置信息...',
    [TASK_STATUS.GENERATING]: '正在生成音乐，请耐心等待...',
    [TASK_STATUS.COMPLETED]: '音乐生成完成！',
    [TASK_STATUS.FAILED]: '音乐生成失败',
  };
  return messages[status] || '处理中...';
}

// 工具函数
export const utils = {
  /**
   * 检查任务是否完成
   */
  isTaskCompleted: (status) => {
    return status === TASK_STATUS.COMPLETED;
  },

  /**
   * 检查任务是否失败
   */
  isTaskFailed: (status) => {
    return status === TASK_STATUS.FAILED;
  },

  /**
   * 检查任务是否正在进行中
   */
  isTaskInProgress: (status) => {
    return [TASK_STATUS.PENDING, TASK_STATUS.ANALYZING, TASK_STATUS.GENERATING].includes(status);
  },

  /**
   * 格式化时间
   */
  formatTime: (isoString) => {
    return new Date(isoString).toLocaleString('zh-CN');
  },

  /**
   * 格式化文件大小
   */
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * 验证图片文件
   */
  validateImageFile: (file) => {
    const allowedTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'];
    const maxSize = 16 * 1024 * 1024; // 16MB
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`文件类型不支持: ${file.type}`);
    }
    
    if (file.size > maxSize) {
      throw new Error(`文件大小超过限制: ${utils.formatFileSize(file.size)} > ${utils.formatFileSize(maxSize)}`);
    }
    
    return true;
  },

  /**
   * 批量验证图片文件
   */
  validateImageFiles: (files) => {
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('请选择至少一张图片');
    }
    
    files.forEach((file, index) => {
      try {
        utils.validateImageFile(file);
      } catch (error) {
        throw new Error(`图片 ${index + 1}: ${error.message}`);
      }
    });
    
    return true;
  },

  /**
   * 提取音乐播放信息
   */
  extractMusicInfo: (taskStatus) => {
    if (!utils.isTaskCompleted(taskStatus.status)) {
      return null;
    }

    return {
      url: taskStatus.music_url,
      title: taskStatus.music_title,
      description: taskStatus.music_description,
      analysis: taskStatus.analysis,
      createdAt: taskStatus.completed_at,
      sono_response:taskStatus.sono_response,
    };
  },
};

export default musicApi;