import React, { useState, useEffect, useRef } from 'react';
import { generateMusic, checkApiHealth } from '/src/data/musicAPI.js';
import { reverseGeocode } from '/src/utils/mapUtils.js';
import './MusicGenerator.css';
import mapStyles from '/src/utils/mapStyles.js'; 
import MusicSlideshowModal from './MusicSlideshowModal';

const MusicGenerator = () => {
  // State management
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' });
  const [locationName, setLocationName] = useState('');    
  const [refineDescription, setRefineDescription] = useState(true);
  const [loading, setLoading] = useState(false); // music
  const [locationLoading, setLocationLoading] = useState(false); // location
  const [imageLoading, setImageLoading] = useState(false); // image
  const [music, setMusic] = useState(null);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [error, setError] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [placeMarkers, setPlaceMarkers] = useState([]);
  const [activeFilters, setActiveFilters] = useState([]);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const infoWindowRef = useRef(null); // InfoWindow
  const googleMapRef = useRef(null);
  const placesServiceRef = useRef(null);
  const mapClickListenerRef = useRef(null); 
  const autocompleteRef = useRef(null); 
  const searchInputRef = useRef(null); 
  const [searchQuery, setSearchQuery] = useState('');
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [musicMarkers, setMusicMarkers] = useState([]); // 音乐播放时的专用标记
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

const placeTypes = [
      { id: 'church', label: 'Churches', icon: '⛪' },
      { id: 'museum', label: 'Museums', icon: '🏛️' },
      { id: 'park', label: 'Parks', icon: '🌳' },
      { id: 'tourist_attraction', label: 'Attractions', icon: '🎭' },
      { id: 'historical_landmark', label: 'Historical Sites', icon: '🏺' },
      { id: 'plaza', label: 'Plazas', icon: '⛲' }, 
      { id: 'restaurant', label: 'Restaurants', icon: '🍽️' }, 
      { id: 'cafe', label: 'Cafes', icon: '☕' },
      { id: 'bar', label: 'Bars', icon: '🍺' },
      { id: 'lodging', label: 'Hotels', icon: '🏨' },
      { id: 'shopping_mall', label: 'Shopping Malls', icon: '🛍️' },
      { id: 'library', label: 'Libraries', icon: '📚' },
  ];

  

  // Load Google Maps
  useEffect(() => {
    const loadGoogleMapsScript = () => {
      if (window.google) {
        initMap();
        return;
      }

    // existingScript check
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.onload = initMap;
      return;
    }

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=en`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      document.head.appendChild(script);
    };

    loadGoogleMapsScript();
  }, []);

  // Initialize the map
  const initMap = () => {
    if (!googleMapRef.current) return;

    // (Milan Duomo) location
    const duomoPosition = { lat: 45.4641, lng: 9.1919 };

    const map = new window.google.maps.Map(googleMapRef.current, {
      center: duomoPosition,
      zoom: 15,
      styles: mapStyles
    });

    // Create main marker
    const marker = new window.google.maps.Marker({
      position: duomoPosition,
      map: map,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
    });

    // Create unified info window 
    const infoWindow = new window.google.maps.InfoWindow({
      maxWidth: 300
    });

    // Create Places service
    const placesService = new window.google.maps.places.PlacesService(map);
    placesServiceRef.current = placesService;

    initializeAutocomplete(map, marker, infoWindow, placesService);

    // initial coordinate
    setCoordinates({
      latitude: duomoPosition.lat,
      longitude: duomoPosition.lng
    });
    geocodeLatLng(duomoPosition.lat, duomoPosition.lng);

    // map listener
    addMapClickListener(map, marker, infoWindow, placesService);

    // Update marker position on drag 
    marker.addListener('dragend', async () => {
      const position = marker.getPosition();
      const lat = position.lat();
      const lng = position.lng();

      // 只有在无筛选模式下才显示InfoWindow
      if (activeFilters.length === 0) {
        // 获取并显示位置信息
        showPlaceInfoWindow(lat, lng, marker, map, infoWindow, placesService);
      }
    });

    mapRef.current = map;
    markerRef.current = marker;
    infoWindowRef.current = infoWindow;
    setMapLoaded(true);
  };

// initializeAutocomplete
const initializeAutocomplete = (map, marker, infoWindow, placesService) => {
  if (!searchInputRef.current) return;

  const autocomplete = new window.google.maps.places.Autocomplete(
    searchInputRef.current,
    {
      types: ['geocode', 'establishment'],
      fields: ['place_id', 'geometry', 'name', 'formatted_address', 'photos', 'types']
    }
  );

  autocomplete.bindTo('bounds', map);
  
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    
    if (!place.geometry || !place.geometry.location) {
      setError('Unable to find location information for this address');
      return;
    }

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const position = { lat, lng };

    // clear filter
    setActiveFilters([]);

    // smooth transimition
    
    marker.setVisible(false);
    
    const currentCenter = map.getCenter();
    const currentLat = currentCenter.lat();
    const currentLng = currentCenter.lng();
    
    const distance = Math.sqrt(
      Math.pow(lat - currentLat, 2) + Math.pow(lng - currentLng, 2)
    );
    
    if (distance > 0.1) { 
      map.setZoom(Math.max(map.getZoom() - 3, 2));
      
      setTimeout(() => {
        // 平移到新位置
        map.panTo(position);
        
        setTimeout(() => {
          // 逐步缩放到目标层级
          smoothZoomTo(map, 15, 300);
          
          // 延迟显示标记，等动画基本完成
          setTimeout(() => {
            marker.setPosition(position);
            marker.setVisible(true);
            
            // 添加标记的弹跳动画
            marker.setAnimation(window.google.maps.Animation.BOUNCE);
            setTimeout(() => {
              marker.setAnimation(null);
            }, 2000);
            
            // 显示信息窗口
            showPlaceInfoWindow(lat, lng, marker, map, infoWindow, placesService, place);
          }, 500);
        }, 800);
      }, 600);
      
    } else { 
      map.panTo(position);
      

      if (map.getZoom() !== 15) {
        smoothZoomTo(map, 15, 500);
      }
      
      // 延迟更新标记位置
      setTimeout(() => {
        marker.setPosition(position);
        marker.setVisible(true);
        
        // 轻微的弹跳效果
        marker.setAnimation(window.google.maps.Animation.DROP);
        
        // 显示信息窗口
        setTimeout(() => {
          showPlaceInfoWindow(lat, lng, marker, map, infoWindow, placesService, place);
        }, 300);
      }, 400);
    }

    // 清空搜索框
    setSearchQuery('');
  });

  autocompleteRef.current = autocomplete;
};

// 新增：平滑缩放函数
const smoothZoomTo = (map, targetZoom, duration = 500) => {
  const currentZoom = map.getZoom();
  const zoomDiff = targetZoom - currentZoom;
  const steps = Math.abs(zoomDiff) * 2; // 增加步数让动画更流畅
  const stepSize = zoomDiff / steps;
  const stepDuration = duration / steps;
  
  let currentStep = 0;
  
  const zoomStep = () => {
    if (currentStep >= steps) {
      map.setZoom(targetZoom); // 确保最终到达精确的目标缩放级别
      return;
    }
    
    const newZoom = currentZoom + (stepSize * (currentStep + 1));
    map.setZoom(newZoom);
    currentStep++;
    
    setTimeout(zoomStep, stepDuration);
  };
  
  zoomStep();
};

    // 新增：处理搜索输入变化
    const handleSearchInputChange = (e) => {
      setSearchQuery(e.target.value);
    };
  
    // 新增：清除搜索框
    const clearSearch = () => {
      setSearchQuery('');
      if (searchInputRef.current) {
        searchInputRef.current.value = '';
      }
    };
  
    const geocodeLatLng = (lat, lng) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const components = results[0].address_components;
          let city = '';
          let country = '';
          
          for (const comp of components) {
            if (comp.types.includes('locality')) city = comp.long_name;
            if (comp.types.includes('country')) country = comp.long_name;
          }
          
          // 只设置城市+国家
          setLocationName(city && country ? `${city}, ${country}` : results[0].formatted_address);
        }
      });
    };

  // 添加地图点击事件监听器
  const addMapClickListener = (map, marker, infoWindow, placesService) => {

  // 添加这个检查
  if (!map || !marker || !infoWindow || !placesService) {
    return;
  }

    // 如果已有监听器，先移除
    if (mapClickListenerRef.current) {
      window.google.maps.event.removeListener(mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }

    // 添加新的监听器
    mapClickListenerRef.current = map.addListener('click', async (event) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      
      marker.setPosition(event.latLng);

      // 只有在无筛选模式下才显示InfoWindow
      if (activeFilters.length === 0) {
        // 获取并显示位置信息
        showPlaceInfoWindow(lat, lng, marker, map, infoWindow, placesService);
      }
    });
  };

  // 移除地图点击事件监听器
  const removeMapClickListener = () => {
    if (mapClickListenerRef.current) {
      window.google.maps.event.removeListener(mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }
  };

  // 统一的InfoWindow显示函数
  const showPlaceInfoWindow = async (lat, lng, marker, map, infoWindow, placesService, placeDetails = null) => {
    try {
      if (placeDetails) {
        // 如果已经有地点详情，直接使用
        const detailedPlace = {
          name: placeDetails.name || 'Selected Location',
          address: placeDetails.formatted_address || placeDetails.vicinity || 'Address not available',
          photos: placeDetails.photos ? placeDetails.photos.map(photo => ({
            url: photo.getUrl({ maxWidth: 500, maxHeight: 300 }),
            getUrl: (options) => photo.getUrl(options)
          })) : [],
          placeId: placeDetails.place_id,
          position: { lat, lng }
        };
        
        // 立即更新状态并显示
        setSelectedPlace(detailedPlace);
        
        // 使用 Promise 来确保状态更新后再显示信息窗口
        await new Promise(resolve => {
          setTimeout(() => {
            displayInfoWindow(detailedPlace, lat, lng, marker, map, infoWindow);
            resolve();
          }, 50);
        });
        
        return;
      }
  

      // 先用反向地理编码获取基本地址信息
      const geoResult = await reverseGeocode({ latitude: lat, longitude: lng });
      
      // 使用 Places API 搜索附近地点
      const request = {
        location: new window.google.maps.LatLng(lat, lng),
        radius: '50', // 缩小搜索半径获取更精确的结果
      };

      placesService.nearbySearch(request, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
          // 获取最近地点的详细信息
          placesService.getDetails(
            { 
              placeId: results[0].place_id, 
              fields: ['name', 'formatted_address', 'photos', 'place_id', 'types', 'vicinity']
            },
            (place, detailStatus) => {
              if (detailStatus === window.google.maps.places.PlacesServiceStatus.OK) {
                // 处理地点类型以获得更好的名称
                let placeName = place.name;
                if (!placeName || placeName === geoResult.address.split(',')[0]) {
                  // 尝试从类型获取更有意义的名称
                  if (place.types && place.types.includes('church')) {
                    placeName = 'Church near ' + geoResult.address.split(',')[0];
                  } else if (place.types && place.types.includes('tourist_attraction')) {
                    placeName = 'Tourist Attraction: ' + geoResult.address.split(',')[0];
                  }
                }
                
                const detailedPlace = {
                  name: placeName,
                  address: place.formatted_address || place.vicinity || geoResult.address,
                  photos: place.photos ? place.photos.map(photo => ({
                    url: photo.getUrl({ maxWidth: 500, maxHeight: 300 }),
                    getUrl: (options) => photo.getUrl(options)
                  })) : [],
                  placeId: place.place_id,
                  position: { lat, lng }
                };
                
                setSelectedPlace(detailedPlace);
                displayInfoWindow(detailedPlace, lat, lng, marker, map, infoWindow);
              } else {
                // 如果找不到详细信息，使用地理编码结果
                const fallbackPlace = {
                  name: geoResult.address.split(',')[0],
                  address: geoResult.address,
                  photos: [],
                  position: { lat, lng }
                };
                setSelectedPlace(fallbackPlace);
                displayInfoWindow(fallbackPlace, lat, lng, marker, map, infoWindow);
              }
            }
          );
        } else {
          // 如果找不到地点信息，仅显示地址
          const fallbackPlace = {
            name: geoResult.address.split(',')[0],
            address: geoResult.address,
            photos: [],
            position: { lat, lng }
          };
          setSelectedPlace(fallbackPlace);
          displayInfoWindow(fallbackPlace, lat, lng, marker, map, infoWindow);
        }
      });
    } catch (error) {
      console.error('Failed to get place information:', error);
    }
  };

  // 统一的InfoWindow内容显示函数
  const displayInfoWindow = (place, lat, lng, marker, map, infoWindow) => {
    const infoWindowContent = generateInfoWindowContent(place, lat, lng);
    infoWindow.setContent(infoWindowContent);
    infoWindow.open({
      anchor: marker,
      map: map,
    });
  };

  const updateInfoWindowButtonState = () => {
    const button = document.getElementById('add-to-music-btn');
    if (button) {
      if (loading || imageLoading) {
        button.disabled = true;
        button.classList.add('disabled');
        button.textContent = loading ? 'Generating Music...' : 'Adding Image...';
      } else {
        button.disabled = false;
        button.classList.remove('disabled');
        button.textContent = 'Add to Music Generation';
      }
    }
  };

  useEffect(() => {
    updateInfoWindowButtonState();
  }, [loading, imageLoading]);

  // Generate info window content
  const generateInfoWindowContent = (place, lat, lng) => {
    // 确定要在InfoWindow中显示的图片URL，并保存到selectedPlace中
    let displayImageUrl = '';
    let imageSource = null; // 'place_photo' 或 'street_view'
    
    displayImageUrl = `https://maps.googleapis.com/maps/api/streetview?size=300x200&location=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
    imageSource = 'street_view';
    
    // 更新selectedPlace，包含当前显示的图片信息
    setSelectedPlace(prev => ({
      ...prev,
      displayImageUrl: displayImageUrl,
      imageSource: imageSource,
      position: { lat, lng }
    }));
    
    const photoHtml = `<div class="info-window-photo">
      <img src="${displayImageUrl}" alt="${place.name || 'Location'}">
     </div>`;
      
    return `
      <div class="info-window-content">
        <h3 class="info-window-title">${place.name || 'Unnamed Location'}</h3>
        ${photoHtml}
        <p class="info-window-address">${place.address || 'Address Unknown'}</p>
        <button id="add-to-music-btn" class="info-window-button">Add to Music Generation</button>
      </div>
    `;
  };

// 处理Filter模式切换
useEffect(() => {
  if (!mapLoaded) return;
  
  // 无论何种情况，都先关闭信息窗口
  if (infoWindowRef.current) {
    infoWindowRef.current.close();
  }
  
  // 清除选中的地点
  setSelectedPlace(null);
  
  // 处理从有筛选器到无筛选器的转换
  if (activeFilters.length === 0) {
    // 清除所有标记
    clearPlaceMarkers();
    
    // 无Filter模式：显示主标记，启用地图点击
    if (markerRef.current) {
      markerRef.current.setVisible(true);
    }
    addMapClickListener(mapRef.current, markerRef.current, infoWindowRef.current, placesServiceRef.current);
    return;
  }
  
  // 有筛选器模式：隐藏主标记，禁用地图点击
  if (markerRef.current) {
    markerRef.current.setVisible(false);
  }
  removeMapClickListener();
  
  // 检查是新增筛选器还是移除筛选器
  const lastFilter = activeFilters[activeFilters.length - 1];
  const isNewlyAddedFilter = !prevActiveFiltersRef.current.includes(lastFilter);
  
  // 检查是否有移除的筛选器
  const removedFilters = prevActiveFiltersRef.current.filter(
    filter => !activeFilters.includes(filter)
  );
  
  // 处理移除的筛选器
  if (removedFilters.length > 0) {
    removedFilters.forEach(removedFilter => {
      removePlaceMarkersByType(removedFilter);
    });
  }
  
  // 处理新增的筛选器
  if (isNewlyAddedFilter) {
    searchPlacesByType(lastFilter);
  }
  
  // 更新前一次的筛选器状态
  prevActiveFiltersRef.current = [...activeFilters];
  
}, [activeFilters, mapLoaded]);

// 保存前一次的筛选器状态
const prevActiveFiltersRef = useRef([]);

// 处理筛选器变化
const handleFilterChange = (placeType) => {
  if (activeFilters.includes(placeType)) {
    // 如果类型已被选中，取消选择
    setActiveFilters(activeFilters.filter(filter => filter !== placeType));
  } else {
    // 添加到选中的筛选器列表中
    setActiveFilters([...activeFilters, placeType]);
  }
};

// 根据类型移除标记
const removePlaceMarkersByType = (placeType) => {
  // 找出要移除的标记
  const markersToRemove = placeMarkers.filter(marker => marker.placeType === placeType);
  
  // 从地图中移除标记
  markersToRemove.forEach(markerData => {
    markerData.marker.setMap(null);
  });
  
  // 更新标记列表，保留其他类型的标记
  setPlaceMarkers(prevMarkers => prevMarkers.filter(marker => marker.placeType !== placeType));
};

// 搜索并标记指定类型的地点
const searchPlacesByType = (placeType) => {
  if (!mapLoaded) return;
  
  // 获取地图中心和边界
  const center = mapRef.current.getCenter();
  const bounds = mapRef.current.getBounds();
  
  // 如果边界还没有准备好，使用当前中心点周围的默认范围
  const searchRadius = bounds ? null : 1000;
  
  const request = {
    location: center,
    radius: searchRadius,
    bounds: bounds,
    type: placeType
  };
  
  placesServiceRef.current.nearbySearch(request, (results, status) => {
    if (status === window.google.maps.places.PlacesServiceStatus.OK) {
      // 为搜索结果添加标记
      const newMarkers = results.map(place => {
        // 根据地点类型选择图标
        const placeTypeInfo = placeTypes.find(type => type.id === placeType);

        // 创建标记
        const marker = new window.google.maps.Marker({
          position: place.geometry.location,
          map: mapRef.current,
          title: place.name,
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
                <text x="16" y="20" font-size="20" text-anchor="middle" font-family="Arial, sans-serif">
                  ${placeTypeInfo ? placeTypeInfo.icon : '📍'}
                </text>
              </svg>
            `),
            scaledSize: new window.google.maps.Size(32, 32),
            anchor: new window.google.maps.Point(16, 16)
          },
          animation: window.google.maps.Animation.DROP
        });

        // 为标记添加点击事件
        marker.addListener('click', () => {
          // 获取地点详细信息
          placesServiceRef.current.getDetails(
            {
              placeId: place.place_id,
              fields: ['name', 'formatted_address', 'photos', 'place_id', 'types', 'vicinity']
            },
            (placeDetails, detailStatus) => {
              if (detailStatus === window.google.maps.places.PlacesServiceStatus.OK) {
                showPlaceInfoWindow(
                  place.geometry.location.lat(),
                  place.geometry.location.lng(),
                  marker,
                  mapRef.current,
                  infoWindowRef.current,
                  placesServiceRef.current,
                  placeDetails
                );
              }
            }
          );
        });

        return {
          marker,
          placeType
        };
      });
      
      // 添加到现有的标记集合中
      setPlaceMarkers(prevMarkers => [...prevMarkers, ...newMarkers]);
    }
  });
};
  
  // 清除所有地点标记
  const clearPlaceMarkers = () => {
    placeMarkers.forEach(markerData => {
      markerData.marker.setMap(null);
    });
    
    setPlaceMarkers([]);
  };
  

  useEffect(() => {
    const initializeApi = async () => {
      console.log('开始初始化API连接...');
      
      // 导入调试函数并测试连接
      const { checkApiHealth, debugApiConnection } = await import('/src/data/musicAPI');
      
      // 运行详细的连接调试
      await debugApiConnection();
      
      // 检查API可用性
      const available = await checkApiHealth();
      console.log('API可用性检查结果:', available);
      setApiAvailable(available);
    };
    
    initializeApi();
  }, []);

// 修改 addPlaceToMusicGenerator 函数
const addPlaceToMusicGenerator = async () => {
  if (!selectedPlace || !selectedPlace.displayImageUrl) {
    setError('No location or image selected.');
    return;
  }
  
  try {
    setImageLoading(true); // 使用专门的imageLoading状态
    
    // 更新坐标和位置信息 - 只有在点击按钮时才更新
    setCoordinates({
      latitude: selectedPlace.position.lat,
      longitude: selectedPlace.position.lng
    });
    
    // 从坐标获取城市+国家信息
    try {
      const geoResult = await reverseGeocode({ 
        latitude: selectedPlace.position.lat, 
        longitude: selectedPlace.position.lng 
      });
  
    // 解析地址组件获取城市和国家
    const addressParts = geoResult.address.split(',');
    let city = '', country = '';
  
    // 简单解析：通常最后一个是国家，倒数第二个可能是城市/地区
    if (addressParts.length >= 2) {
      country = addressParts[addressParts.length - 1].trim();
      city = addressParts[addressParts.length - 2].trim();
    }
  
    setLocationName(city && country ? `${city}, ${country}` : selectedPlace.name);
    } catch (error) {
      // 如果获取失败，使用原有逻辑
      setLocationName(selectedPlace.name);
    }
    
    // 获取InfoWindow中当前显示的图片
    const response = await fetch(selectedPlace.displayImageUrl);
    const blob = await response.blob();
    
    // 根据图片来源生成文件名
    const timestamp = Date.now();
    const fileName = selectedPlace.imageSource === 'place_photo' 
      ? `place_${selectedPlace.name.replace(/\s+/g, '_')}_${timestamp}.jpg`
      : `streetview_${selectedPlace.name.replace(/\s+/g, '_')}_${timestamp}.jpg`;
    
    const photoFile = new File([blob], fileName, { type: 'image/jpeg' });
    
    // 追加到现有图片中，不删除之前的
    const updatedImages = [...images, photoFile];
    setImages(updatedImages);
    
    // 创建新预览并追加到现有预览中
    const newPreview = {
      file: photoFile,
      url: URL.createObjectURL(photoFile),
      id: timestamp,
      location: {  // 新增
        lat: selectedPlace.position.lat,
        lng: selectedPlace.position.lng,
        name: selectedPlace.name,
        address: selectedPlace.address
      }
    };
    
    setPreviews(prevPreviews => [...prevPreviews, newPreview]);
    setImageLoading(false);
    
    console.log('Image added successfully:', fileName);
    
  } catch (err) {
    setError('Failed to add image from location.');
    setImageLoading(false); 
    console.error('Failed to fetch image:', err);
  }
};

  // Listen for info window button click
  useEffect(() => {
    const handleInfoWindowButtonClick = (e) => {
      if (e.target && e.target.id === 'add-to-music-btn') {
        addPlaceToMusicGenerator();
      }
    };

    document.addEventListener('click', handleInfoWindowButtonClick);
    
    return () => {
      document.removeEventListener('click', handleInfoWindowButtonClick);
    };
  }, [selectedPlace, previews]);

  // Handle image upload
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    
    // 追加到现有图片中，不删除之前的
    const updatedImages = [...images, ...files];
    setImages(updatedImages);
    
    // Create new previews and append to existing ones
    const newPreviews = files.map(file => ({
      file,
      url: URL.createObjectURL(file),
      id: Date.now() + Math.random(),
      location: null  // 手动上传的图片没有位置信息
    }));
    
    setPreviews(prevPreviews => [...prevPreviews, ...newPreviews]);
  };

  // 删除单张图片
  const removeImage = (indexToRemove) => {
    // 清理要删除的预览URL
    URL.revokeObjectURL(previews[indexToRemove].url);
    
    // 从images和previews数组中移除指定索引的项目
    const updatedImages = images.filter((_, index) => index !== indexToRemove);
    const updatedPreviews = previews.filter((_, index) => index !== indexToRemove);
    
    setImages(updatedImages);
    setPreviews(updatedPreviews);
  };

  // Generate music
  const handleGenerateMusic = async () => {
    // Validate input
    if (images.length === 0) {
      setError('Please upload at least one image.');
      return;
    }
    
    if (!coordinates.latitude || !coordinates.longitude) {
      setError('Please select a location on the map.');
      return;
    }

    setLoading(true); 
    setError(null); 

    try {
      // pack coords + human‑readable address
      const coordsArray = [coordinates.latitude, coordinates.longitude];
      console.log(coordsArray);
      const musicBlob = await generateMusic(images, coordsArray, { refineDescription });
      const audioUrl = URL.createObjectURL(musicBlob);
      if (music) URL.revokeObjectURL(music.url);
      setMusic({ url: audioUrl, blob: musicBlob });
    } catch (e) {
      setError(`Failed to generate music: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Download generated music
  const downloadMusic = () => {
    if (!music) return;
    
    const a = document.createElement('a');
    a.href = music.url;
    a.download = 'generated_music.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleMusicPlay = () => {
    setIsMusicPlaying(true);
    clearAllMarkersAndFilters();
    showImageMarkersSequentially();
  };
  
  const handleMusicPause = () => {
    setIsMusicPlaying(false);
  };
  
  const handleMusicEnd = () => {
    setIsMusicPlaying(false);
    clearMusicMarkers();
  };
  
  const clearAllMarkersAndFilters = () => {
    // 清除筛选
    setActiveFilters([]);
    // 清除筛选标记
    clearPlaceMarkers();
    // 隐藏主标记
    if (markerRef.current) {
      markerRef.current.setVisible(false);
    }
    // 关闭信息窗口
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
  };
  
const showImageMarkersSequentially = () => {
  const imagesWithLocation = previews.filter(preview => preview.location);
  if (imagesWithLocation.length === 0) return;
  
  // 计算所有位置的边界，调整地图视野包含所有标记
  const bounds = new window.google.maps.LatLngBounds();
  imagesWithLocation.forEach(preview => {
    bounds.extend({ lat: preview.location.lat, lng: preview.location.lng });
  });
  mapRef.current.fitBounds(bounds);
  
  // 获取音频时长并计算间隔
  const audioElement = document.querySelector('.audio-player');
  const audioDuration = audioElement ? audioElement.duration : 10; // 默认10秒
  const interval = audioDuration / imagesWithLocation.length * 1000; // 转换为毫秒
  
  imagesWithLocation.forEach((preview, index) => {
    setTimeout(() => {
      const marker = new window.google.maps.Marker({
        position: { lat: preview.location.lat, lng: preview.location.lng },
        map: mapRef.current,
        title: `Image ${index + 1}: ${preview.location.name}`,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="15" fill="#FF6B6B" stroke="#fff" stroke-width="2"/>
              <text x="16" y="20" font-size="14" text-anchor="middle" fill="white" font-weight="bold">
                ${index + 1}
              </text>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(32, 32),
          anchor: new window.google.maps.Point(16, 16)
        },
        animation: window.google.maps.Animation.DROP
      });
      
      setMusicMarkers(prev => [...prev, marker]);
    }, index * interval);
  });
};
  
const clearMusicMarkers = () => {
  // 清除所有音乐播放标记
  musicMarkers.forEach(marker => {
    if (marker && marker.setMap) {
      marker.setMap(null);
    }
  });
  setMusicMarkers([]);
  
  // 重新显示主标记
  if (markerRef.current) {
    markerRef.current.setVisible(true);
  }
  
  // 重新添加地图点击监听器
  if (activeFilters.length === 0) {
    addMapClickListener(mapRef.current, markerRef.current, infoWindowRef.current, placesServiceRef.current);
  }
};

  // 组件卸载时清理音乐标记
  useEffect(() => {
    return () => {
     clearMusicMarkers();
    };
  }, [music]); // 当音乐重新生成时清理旧标记

  const testMarkersDirectly = () => {
    console.log('Testing marker sequence...');
    handleMusicPlay(); // 直接调用你的新函数
  };
  
  return (
    <div className="map-music-container">
      {/* Left map area */}
      <div className="map-container">
        <div className="form-group">
          <div className="search-input-container">
            <input 
              ref={searchInputRef}  // 连接到ref
              type="text" 
              placeholder="Search address or place name"
              value={searchQuery}   // 绑定状态
              onChange={handleSearchInputChange}  // 处理输入变化
              className="search-input"
            />
            {searchQuery && (
              <button 
                type="button"
                className="clear-search-btn"
                onClick={clearSearch}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="map-controls">
          <div className="filter-container">
            {/*<h3>Place Filters</h3>*/}
            <div className="filter-buttons">
              {placeTypes.map(type => (
                <button
                  key={type.id}
                  className={`filter-button ${activeFilters.includes(type.id) ? 'active' : ''}`}
                  onClick={() => handleFilterChange(type.id)}
                >
                  <span className="filter-icon">{type.icon}</span>
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div 
          ref={googleMapRef}
          className="google-map"
        ></div>
      </div>
      
      {/* Right control panel */}
      <div className="sidebar-container">
        <div className="music-generator">
          <h2>Music Generation Control Panel</h2>
          
          {error && <div className="error-message">{error}</div>}
          
          {!apiAvailable && (
            <div className="api-warning">
              ⚠️ Music generation service not connected. Please ensure the API server is running.
            </div>
          )}
          
          <div className="form-group">
            <label>Upload Images (multiple allowed)</label>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              onChange={handleImageUpload} 
              disabled={loading}
            />
            
            {previews.length > 0 && (
              <div className="image-preview-container">
                {previews.map((preview, index) => (
                  <div key={preview.id || index} className="image-preview-wrapper">
                    <img 
                      src={preview.url} 
                      alt={`Preview ${index + 1}`} 
                      className="image-preview" 
                    />
                    <button 
                      className="remove-image-btn"
                      onClick={() => removeImage(index)}
                      type="button"
                      title="Remove this image"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="form-group">
            <strong>Location Information</strong>
            <div className="location-display">
              {locationName && (
                <div className="location-name">
                  <strong>Current Location:</strong> <br />
                  {locationName}</div>
              )}
            <div className="coordinates-inputs">
              {/* Latitude Display */}
              <div className="coordinate-display">
                <strong>Latitude:</strong> 
                {
                 typeof coordinates.latitude === 'number'
                   ? coordinates.latitude.toFixed(3) 
                   : coordinates.latitude !== null && coordinates.latitude !== ''
                     ? parseFloat(coordinates.latitude).toFixed(3)
                     : 'N/A' 
                }
              </div>

              {/* Longitude Display */}
              <div className="coordinate-display">
               <strong>Longitude:</strong> 
                {
                  typeof coordinates.longitude === 'number'
                    ? coordinates.longitude.toFixed(3) 
                    : coordinates.longitude !== null && coordinates.longitude !== ''
                      ? parseFloat(coordinates.longitude).toFixed(3)
                      : 'N/A'
                }
              </div>
            </div>
          </div>
            <p className="map-tip">
              {activeFilters.length === 0 
                ? "You can click anywhere on the map to select a location." 
                : "Filter mode active: You can only select filtered places on the map."}
            </p>
          </div>
          
          <div className="form-group checkbox">
            <label>
              <input 
                type="checkbox" 
                checked={refineDescription} 
                onChange={(e) => setRefineDescription(e.target.checked)} 
                disabled={loading}
              />
              Refine Scene Description (generate more detailed music)
            </label>
          </div>
          
          <button 
            className="generate-button" 
            onClick={handleGenerateMusic} 
            disabled={loading || !apiAvailable}
          >
            {loading ? 'Generating...' : 'Generate Music'}
          </button>
          
          {loading && <div className="loading-spinner">Processing, please wait...</div>}
          
          {music && !loading && (
            <div className="music-result">
              <h3>Generated Music</h3>

            <audio 
              controls 
              src={music.url} 
              className="audio-player"
              onPlay={handleMusicPlay}  // 新增
              onPause={handleMusicPause}  // 新增
              onEnded={handleMusicEnd}  // 新增
            />
              <div className="music-buttons">
                <button 
                  onClick={() => setShowSlideshow(true)} 
                  className="slideshow-button"
                >
                  🎵 Play with Slideshow
                </button>
                <button onClick={downloadMusic} className="download-button">
        Download Music
                </button>
              </div>
            </div>
          )}
          <MusicSlideshowModal
            isOpen={showSlideshow}
            onClose={() => setShowSlideshow(false)}
            musicUrl={music?.url}
            images={previews}
            locationName={locationName}
          />
        </div>
      </div>
    </div>
  );
};


export default MusicGenerator;

