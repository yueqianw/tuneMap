// src/utils/mapUtils.js

/**
 * 加载Google Maps API脚本
 * @param {string} apiKey - Google Maps API密钥
 * @returns {Promise} - 加载完成后的Promise
 */
export const loadGoogleMapsApi = (apiKey) => {
    return new Promise((resolve, reject) => {
      // 如果已经加载，直接返回
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
        return;
      }
  
      // 创建回调函数名
      const callbackName = `googleMapsApiCallback_${Math.random().toString(36).substring(2)}`;
      
      // 创建全局回调
      window[callbackName] = () => {
        resolve(window.google.maps);
        delete window[callbackName];
      };
  
      // 创建脚本标签
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${callbackName}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onerror = (error) => {
        reject(new Error('Google Maps API加载失败'));
      };
  
      // 添加到文档中
      document.head.appendChild(script);
    });
  };
  
  /**
   * 获取地址的地理编码
   * @param {string} address - 地址字符串
   * @returns {Promise} - 包含位置信息的Promise
   */
  export const geocodeAddress = (address) => {
    return new Promise((resolve, reject) => {
      if (!window.google || !window.google.maps) {
        reject(new Error('Google Maps API未加载'));
        return;
      }
      
      const geocoder = new window.google.maps.Geocoder();
      
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location;
          resolve({
            latitude: location.lat(),
            longitude: location.lng(),
            formattedAddress: results[0].formatted_address,
            placeId: results[0].place_id
          });
        } else {
          reject(new Error(`地理编码失败：${status}`));
        }
      });
    });
  };
  
  /**
   * 反向地理编码 - 获取坐标的地址
   * @param {Object} coords - 包含lat和lng属性的对象
   * @returns {Promise} - 包含地址信息的Promise
   */
  export const reverseGeocode = (coords) => {
    return new Promise((resolve, reject) => {
      if (!window.google || !window.google.maps) {
        reject(new Error('Google Maps API未加载'));
        return;
      }
      
      const geocoder = new window.google.maps.Geocoder();
      const latlng = { lat: parseFloat(coords.latitude), lng: parseFloat(coords.longitude) };
      
      geocoder.geocode({ location: latlng }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          resolve({
            address: results[0].formatted_address,
            placeId: results[0].place_id,
            addressComponents: results[0].address_components
          });
        } else {
          reject(new Error(`反向地理编码失败：${status}`));
        }
      });
    });
  };
  
  /**
   * 获取地图中心点和缩放级别的边界范围
   * @param {Array} locations - 位置数组，每个元素包含lat和lng属性
   * @returns {Object} - 包含边界信息的对象
   */
  export const getBoundsForLocations = (locations) => {
    if (!window.google || !window.google.maps) {
      throw new Error('Google Maps API未加载');
    }
    
    if (!locations || locations.length === 0) {
      return null;
    }
    
    const bounds = new window.google.maps.LatLngBounds();
    
    locations.forEach(location => {
      bounds.extend(new window.google.maps.LatLng(
        parseFloat(location.lat || location.latitude),
        parseFloat(location.lng || location.longitude)
      ));
    });
    
    return bounds;
  };
  
  /**
   * 格式化坐标显示文本
   * @param {number} coord - 坐标值
   * @param {string} direction - 方向标识（'N', 'S', 'E', 'W'）
   * @returns {string} - 格式化后的坐标字符串
   */
  export const formatCoordinate = (coord, direction) => {
    const absoluteCoord = Math.abs(coord);
    const degrees = Math.floor(absoluteCoord);
    const minutes = Math.floor((absoluteCoord - degrees) * 60);
    const seconds = ((absoluteCoord - degrees - minutes / 60) * 3600).toFixed(2);
    
    return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
  };
  
  /**
   * 格式化纬度显示
   * @param {number} latitude - 纬度值
   * @returns {string} - 格式化后的纬度字符串
   */
  export const formatLatitude = (latitude) => {
    return formatCoordinate(latitude, latitude >= 0 ? 'N' : 'S');
  };
  
  /**
   * 格式化经度显示
   * @param {number} longitude - 经度值
   * @returns {string} - 格式化后的经度字符串
   */
  export const formatLongitude = (longitude) => {
    return formatCoordinate(longitude, longitude >= 0 ? 'E' : 'W');
  };