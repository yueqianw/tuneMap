import React, { useState, useEffect, useRef } from 'react';
import { generateMusic, checkApiHealth } from '/src/data/musicAPI.js';
import { reverseGeocode } from '/src/utils/mapUtils.js';
import './MusicGenerator.css';

const MusicGenerator = () => {
  // State management
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' });
  const [refineDescription, setRefineDescription] = useState(true);
  const [loading, setLoading] = useState(false);
  const [music, setMusic] = useState(null);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [error, setError] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [placeMarkers, setPlaceMarkers] = useState([]);
  const [activeFilters, setActiveFilters] = useState([]);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const infoWindowRef = useRef(null); // 统一的InfoWindow
  const googleMapRef = useRef(null);
  const placesServiceRef = useRef(null);
  const mapClickListenerRef = useRef(null); // 保存地图点击事件监听器的引用

// src/MusicGenerator.jsx

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

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
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

    // 米兰大教堂 (Milan Duomo)位置
    const duomoPosition = { lat: 45.4641, lng: 9.1919 };

    const map = new window.google.maps.Map(googleMapRef.current, {
      center: duomoPosition,
      zoom: 15,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    // Create main marker
    const marker = new window.google.maps.Marker({
      position: duomoPosition,
      map: map,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
    });

    // Create unified info window (统一的InfoWindow)
    const infoWindow = new window.google.maps.InfoWindow({
      maxWidth: 300
    });

    // Create Places service
    const placesService = new window.google.maps.places.PlacesService(map);
    placesServiceRef.current = placesService;

    // 初始加载时更新坐标状态但不显示InfoWindow
    setCoordinates({
      latitude: duomoPosition.lat,
      longitude: duomoPosition.lng
    });

    // 添加地图点击事件监听器（初始默认开启）
    addMapClickListener(map, marker, infoWindow, placesService);

    // Update coordinates on marker drag
    marker.addListener('dragend', async () => {
      const position = marker.getPosition();
      const lat = position.lat();
      const lng = position.lng();
      
      setCoordinates({
        latitude: lat,
        longitude: lng
      });

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

  // 添加地图点击事件监听器
  const addMapClickListener = (map, marker, infoWindow, placesService) => {
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
      setCoordinates({
        latitude: lat,
        longitude: lng
      });

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
          name: placeDetails.name,
          address: placeDetails.formatted_address || placeDetails.vicinity,
          photos: placeDetails.photos ? placeDetails.photos.map(photo => ({
            url: photo.getUrl({ maxWidth: 500, maxHeight: 300 }),
            getUrl: (options) => photo.getUrl(options)
          })) : [],
          placeId: placeDetails.place_id,
          position: { lat, lng }
        };
        
        setSelectedPlace(detailedPlace);
        displayInfoWindow(detailedPlace, lat, lng, marker, map, infoWindow);
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

  // Generate info window content
  const generateInfoWindowContent = (place, lat, lng) => {
    // 确定要在InfoWindow中显示的图片URL，并保存到selectedPlace中
    let displayImageUrl = '';
    let imageSource = null; // 'place_photo' 或 'street_view'
    
    displayImageUrl = `https://maps.googleapis.com/maps/api/streetview?size=300x200&location=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
    imageSource = 'street_view';
    // if (place.photos && place.photos.length > 0) {
    //   displayImageUrl = place.photos[0].getUrl ? place.photos[0].getUrl({ maxWidth: 300, maxHeight: 200 }) : place.photos[0].url;
    //   imageSource = 'place_photo';
    // } else {
      // 如果没有照片，使用街景静态图像

    //}
    
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

  // Add place photos to music generator
  const addPlaceToMusicGenerator = async () => {
    if (!selectedPlace || !selectedPlace.displayImageUrl) {
      setError('No location or image selected.');
      return;
    }
    
    try {
      setLoading(true);
      
      // 更新地址信息（以最后一次传入的为准）
      setCoordinates({
        latitude: selectedPlace.position.lat,
        longitude: selectedPlace.position.lng
      });
      
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
        id: timestamp // 使用时间戳作为唯一ID
      };
      
      setPreviews(prevPreviews => [...prevPreviews, newPreview]);
      setLoading(false);
      
      // 可选：显示成功消息
      console.log('Image added successfully:', fileName);
      
    } catch (err) {
      setError('Failed to add image from location.');
      setLoading(false);
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

  // Update map marker when coordinates are updated from sidebar
  useEffect(() => {
    if (mapLoaded && coordinates.latitude && coordinates.longitude) {
      const position = {
        lat: parseFloat(coordinates.latitude),
        lng: parseFloat(coordinates.longitude)
      };
      
      // 只有在无筛选模式下才更新主标记位置
      if (activeFilters.length === 0 && markerRef.current) {
        markerRef.current.setPosition(position);
        mapRef.current.panTo(position);
        
        // 只有在无筛选模式下才获取和显示位置信息
        if (infoWindowRef.current && mapRef.current) {
          const placesService = new window.google.maps.places.PlacesService(mapRef.current);
          showPlaceInfoWindow(
            position.lat, 
            position.lng, 
            markerRef.current, 
            mapRef.current, 
            infoWindowRef.current,
            placesService
          );
        }
      } else {
        // 在筛选模式下，只移动地图中心不显示标记
        if (mapRef.current) {
          mapRef.current.panTo(position);
        }
      }
    }
  }, [coordinates, mapLoaded, activeFilters]);

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
      id: Date.now() + Math.random() // 添加唯一ID用于删除
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

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          setCoordinates({
            latitude: lat,
            longitude: lng
          });
          
          // Update map view
          if (mapLoaded) {
            const location = { lat, lng };
            mapRef.current.panTo(location);
            mapRef.current.setZoom(15);
            
            // 只有在无筛选模式下才更新主标记位置和显示信息窗口
            if (activeFilters.length === 0) {
              markerRef.current.setPosition(location);
              
              // 获取和显示当前位置的信息
              const placesService = new window.google.maps.places.PlacesService(mapRef.current);
              showPlaceInfoWindow(
                lat, 
                lng, 
                markerRef.current, 
                mapRef.current, 
                infoWindowRef.current,
                placesService
              );
            } else {
              // 在筛选模式下，刷新筛选的地点
              clearPlaceMarkers();
              searchFilteredPlaces();
            }
          }
          
          setLoading(false);
        },
        (error) => {
          setError(`Could not retrieve location: ${error.message}`);
          setLoading(false);
        }
      );
    } else {
      setError('Your browser does not support geolocation.');
    }
  };

  // Generate music
  const handleGenerateMusic = async () => {
    // Validate input
    if (images.length === 0) {
      setError('Please upload at least one image.');
      return;
    }
    
    if (!coordinates.latitude || !coordinates.longitude) {
      setError('Please enter location information or select a location on the map.');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Call API
      const musicBlob = await generateMusic(images, coordinates, {
        refineDescription
      });
      
      // Create audio URL
      const audioUrl = URL.createObjectURL(musicBlob);
      
      // Revoke previous audio URL if it exists
      if (music) {
        URL.revokeObjectURL(music.url);
      }
      
      setMusic({
        url: audioUrl,
        blob: musicBlob
      });
      
    } catch (err) {
      setError(`Failed to generate music: ${err.message}`);
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

  return (
    <div className="map-music-container">
      {/* Left map area */}
      <div className="map-container">
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
            <label>Location Information</label>
            <div className="coordinates-inputs">
              <input 
                type="number" 
                placeholder="Latitude" 
                value={coordinates.latitude} 
                onChange={(e) => setCoordinates({...coordinates, latitude: e.target.value})} 
                disabled={loading}
                step="0.000001"
              />
              <input 
                type="number" 
                placeholder="Longitude" 
                value={coordinates.longitude} 
                onChange={(e) => setCoordinates({...coordinates, longitude: e.target.value})} 
                disabled={loading}
                step="0.000001"
              />
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
              <audio controls src={music.url} className="audio-player" />
              <button onClick={downloadMusic} className="download-button">
                Download Music
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MusicGenerator;

