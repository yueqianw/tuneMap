import React, { useState, useEffect, useRef } from 'react';
import { musicApi, TASK_STATUS, TASK_STATUS_TEXT, getStatusMessage, utils } from '/src/data/musicAPI.js';
import { reverseGeocode } from '/src/utils/mapUtils.js';
import './MusicGenerator.css';
import mapStyles from '/src/utils/mapStyles.js'; 
import MusicSlideshowModal from './MusicSlideshowModal';

const MusicGenerator = () => {
  // State management
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [locationName, setLocationName] = useState('');    
  const [loading, setLoading] = useState(false); // music generation
  const [imageLoading, setImageLoading] = useState(false); // image processing
  const [music, setMusic] = useState(null);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [error, setError] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [placeMarkers, setPlaceMarkers] = useState([]);
  const [activeFilters, setActiveFilters] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [musicMarkers, setMusicMarkers] = useState([]);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [taskStatus, setTaskStatus] = useState(null); 
  const [currentTaskId, setCurrentTaskId] = useState(null);

  // Refs
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const googleMapRef = useRef(null);
  const placesServiceRef = useRef(null);
  const mapClickListenerRef = useRef(null); 
  const autocompleteRef = useRef(null); 
  const searchInputRef = useRef(null); 

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

  // 任务状态显示文本
  const TASK_STATUS_TEXT = {
    [TASK_STATUS.PENDING]: 'Pending',
    [TASK_STATUS.PROCESSING]: 'Processing',
    [TASK_STATUS.COMPLETED]: 'Completed',
    [TASK_STATUS.FAILED]: 'Failed'
  };

  // 获取地点名称的函数
  const getPlaceName = async (lat, lng, placeDetails = null) => {
    try {
      if (placeDetails && placeDetails.name) {
        return placeDetails.name;
      }

      // 如果没有详细信息，尝试通过Places API获取
      if (placesServiceRef.current) {
        return new Promise((resolve) => {
          const request = {
            location: new window.google.maps.LatLng(lat, lng),
            radius: '50',
          };

          placesServiceRef.current.nearbySearch(request, (results, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
              resolve(results[0].name || `Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`);
            } else {
              // 如果没有找到具体地点，使用反向地理编码
              reverseGeocode({ latitude: lat, longitude: lng })
                .then(geoResult => {
                  const addressParts = geoResult.address.split(',');
                  const placeName = addressParts[0] || `Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
                  resolve(placeName);
                })
                .catch(() => {
                  resolve(`Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`);
                });
            }
          });
        });
      } else {
        // 使用反向地理编码作为备选
        const geoResult = await reverseGeocode({ latitude: lat, longitude: lng });
        const addressParts = geoResult.address.split(',');
        return addressParts[0] || `Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
      }
    } catch (error) {
      console.error('Failed to get place name:', error);
      return `Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
    }
  };

  // 生成要发送给后端的地点字符串
  const generateLocationString = () => {
    const locationsWithPlace = previews.filter(preview => preview.location);
    if (locationsWithPlace.length === 0) {
      return '';
    }
    return locationsWithPlace.map(preview => preview.location.name).join(', ');
  };

  // 获取所有唯一的地点信息
  const getUniqueLocations = () => {
    const locationsWithPlace = previews.filter(preview => preview.location);
    const uniqueLocations = [];
    
    locationsWithPlace.forEach(preview => {
      const existingLocation = uniqueLocations.find(loc => 
        Math.abs(loc.lat - preview.location.lat) < 0.0001 && 
        Math.abs(loc.lng - preview.location.lng) < 0.0001
      );
      
      if (!existingLocation) {
        uniqueLocations.push({
          name: preview.location.name,
          lat: preview.location.lat,
          lng: preview.location.lng,
          address: preview.location.address,
          count: 1
        });
      } else {
        existingLocation.count++;
      }
    });
    
    return uniqueLocations;
  };

  // Load Google Maps
  useEffect(() => {
    const loadGoogleMapsScript = () => {
      if (window.google) {
        initMap();
        return;
      }

      // Check for existing script
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        existingScript.onload = initMap;
        return;
      }

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      console.log(apiKey)
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=en`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      document.head.appendChild(script);
    };

    loadGoogleMapsScript();
  }, []);

  // 修改API健康检查
  useEffect(() => {
    const initializeApi = async () => {
      try {
        await musicApi.healthCheck();
        setApiAvailable(true);
      } catch (error) {
        console.error('Failed to initialize API:', error);
        setApiAvailable(false);
      }
    };
    
    initializeApi();
  }, []);

  // Initialize the map
  const initMap = () => {
    if (!googleMapRef.current) return;

    // Milan Duomo location
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

    // Set initial location name
    updateLocationName(duomoPosition.lat, duomoPosition.lng);

    // Add map click listener
    addMapClickListener(map, marker, infoWindow, placesService);

    // Update marker position on drag 
    marker.addListener('dragend', async () => {
      const position = marker.getPosition();
      const lat = position.lat();
      const lng = position.lng();

      // Only show InfoWindow in non-filter mode
      if (activeFilters.length === 0) {
        showPlaceInfoWindow(lat, lng, marker, map, infoWindow, placesService);
      }
    });

    mapRef.current = map;
    markerRef.current = marker;
    infoWindowRef.current = infoWindow;
    setMapLoaded(true);
  };

  // Initialize autocomplete
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

      // Clear filters
      setActiveFilters([]);

      // Smooth transition to new location
      animateToLocation(map, marker, position, () => {
        showPlaceInfoWindow(lat, lng, marker, map, infoWindow, placesService, place);
      });

      // Clear search
      setSearchQuery('');
    });

    autocompleteRef.current = autocomplete;
  };

  // Animate map to new location
  const animateToLocation = (map, marker, position, callback) => {
    marker.setVisible(false);
    
    const currentCenter = map.getCenter();
    const distance = Math.sqrt(
      Math.pow(position.lat - currentCenter.lat(), 2) + 
      Math.pow(position.lng - currentCenter.lng(), 2)
    );
    
    if (distance > 0.1) { 
      map.setZoom(Math.max(map.getZoom() - 2, 5));
      
      setTimeout(() => {
        map.panTo(position);
        setTimeout(() => {
          map.setZoom(15);
          setTimeout(() => {
            marker.setPosition(position);
            marker.setVisible(true);
            marker.setAnimation(window.google.maps.Animation.BOUNCE);
            setTimeout(() => marker.setAnimation(null), 1500);
            if (callback) callback();
          }, 300);
        }, 600);
      }, 400);
    } else { 
      map.panTo(position);
      if (map.getZoom() !== 15) map.setZoom(15);
      
      setTimeout(() => {
        marker.setPosition(position);
        marker.setVisible(true);
        marker.setAnimation(window.google.maps.Animation.DROP);
        if (callback) callback();
      }, 300);
    }
  };

  // Update location name using reverse geocoding
  const updateLocationName = async (lat, lng) => {
    try {
      const geoResult = await reverseGeocode({ latitude: lat, longitude: lng });
      const addressParts = geoResult.address.split(',');
      
      let city = '', country = '';
      if (addressParts.length >= 2) {
        country = addressParts[addressParts.length - 1].trim();
        city = addressParts[addressParts.length - 2].trim();
      }
      
      setLocationName(city && country ? `${city}, ${country}` : geoResult.address);
    } catch (error) {
      console.error('Failed to get location name:', error);
      setLocationName('Unknown Location');
    }
  };

  // Handle search input changes
  const handleSearchInputChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
  };

  // Add map click listener
  const addMapClickListener = (map, marker, infoWindow, placesService) => {
    if (!map || !marker || !infoWindow || !placesService) return;

    // Remove existing listener
    if (mapClickListenerRef.current) {
      window.google.maps.event.removeListener(mapClickListenerRef.current);
    }

    // Add new listener
    mapClickListenerRef.current = map.addListener('click', (event) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      
      marker.setPosition(event.latLng);

      // Only show InfoWindow in non-filter mode
      if (activeFilters.length === 0) {
        showPlaceInfoWindow(lat, lng, marker, map, infoWindow, placesService);
      }
    });
  };

  // Remove map click listener
  const removeMapClickListener = () => {
    if (mapClickListenerRef.current) {
      window.google.maps.event.removeListener(mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }
  };

  // Show place info window
  const showPlaceInfoWindow = async (lat, lng, marker, map, infoWindow, placesService, placeDetails = null) => {
    try {
      let place;
      
      if (placeDetails) {
        // Use provided place details
        place = {
          name: placeDetails.name || 'Selected Location',
          address: placeDetails.formatted_address || placeDetails.vicinity || 'Address not available',
          photos: placeDetails.photos ? placeDetails.photos.map(photo => ({
            url: photo.getUrl({ maxWidth: 500, maxHeight: 300 }),
            getUrl: (options) => photo.getUrl(options)
          })) : [],
          placeId: placeDetails.place_id,
          position: { lat, lng }
        };
      } else {
        // Get place info from reverse geocoding and Places API
        const geoResult = await reverseGeocode({ latitude: lat, longitude: lng });
        
        // Try to find nearby places
        const request = {
          location: new window.google.maps.LatLng(lat, lng),
          radius: '50',
        };

        placesService.nearbySearch(request, (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
            placesService.getDetails(
              { 
                placeId: results[0].place_id, 
                fields: ['name', 'formatted_address', 'photos', 'place_id', 'types', 'vicinity']
              },
              (detailedPlace, detailStatus) => {
                if (detailStatus === window.google.maps.places.PlacesServiceStatus.OK) {
                  place = {
                    name: detailedPlace.name || geoResult.address.split(',')[0],
                    address: detailedPlace.formatted_address || detailedPlace.vicinity || geoResult.address,
                    photos: detailedPlace.photos ? detailedPlace.photos.map(photo => ({
                      url: photo.getUrl({ maxWidth: 500, maxHeight: 300 }),
                      getUrl: (options) => photo.getUrl(options)
                    })) : [],
                    placeId: detailedPlace.place_id,
                    position: { lat, lng }
                  };
                } else {
                  place = {
                    name: geoResult.address.split(',')[0],
                    address: geoResult.address,
                    photos: [],
                    position: { lat, lng }
                  };
                }
                
                displayInfoWindow(place, lat, lng, marker, map, infoWindow);
              }
            );
          } else {
            place = {
              name: geoResult.address.split(',')[0],
              address: geoResult.address,
              photos: [],
              position: { lat, lng }
            };
            displayInfoWindow(place, lat, lng, marker, map, infoWindow);
          }
        });
        
        return; // Early return for async case
      }
      
      // For synchronous case (with placeDetails)
      displayInfoWindow(place, lat, lng, marker, map, infoWindow);
      
    } catch (error) {
      console.error('Failed to get place information:', error);
      setError('Failed to get location information');
    }
  };

  // Display info window
  const displayInfoWindow = (place, lat, lng, marker, map, infoWindow) => {
    // 优先使用Places API Photos，如果没有则回退到Street View
    let displayImageUrl;
    let imageSource = 'places_api';
    
    if (place.photos && place.photos.length > 0) {
      // 选择最佳照片（优先选择较大尺寸的照片）
      const bestPhoto = place.photos.reduce((best, current) => {
        // 尝试获取照片的原始尺寸信息
        const currentUrl = current.getUrl({ maxWidth: 800, maxHeight: 600 });
        const bestUrl = best.getUrl({ maxWidth: 800, maxHeight: 600 });
        
        // 简单启发式：选择URL中包含更大尺寸的照片
        if (currentUrl.includes('800') && !bestUrl.includes('800')) {
          return current;
        }
        return best;
      }, place.photos[0]);
      
      displayImageUrl = bestPhoto.getUrl({ maxWidth: 500, maxHeight: 300 });
      imageSource = 'places_api';
    } else {
      // 回退到Street View
      displayImageUrl = `https://maps.googleapis.com/maps/api/streetview?size=300x200&location=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
      imageSource = 'street_view';
    }
    
    // Update selected place
    const updatedPlace = {
      ...place,
      displayImageUrl: displayImageUrl,
      imageSource: imageSource,
      position: { lat, lng }
    };
    
    setSelectedPlace(updatedPlace);
    
    const infoWindowContent = generateInfoWindowContent(updatedPlace);
    infoWindow.setContent(infoWindowContent);
    infoWindow.open({
      anchor: marker,
      map: map,
    });
  };

  // 简化：生成信息窗口内容，只有一个按钮
  const generateInfoWindowContent = (place) => {
    const photoHtml = `<div class="info-window-photo">
      <img src="${place.displayImageUrl}" alt="${place.name || 'Location'}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';" onload="if(this.previousElementSibling) this.previousElementSibling.style.display='none';">
      <div style="display:block; padding: 20px; text-align: center; background: #f5f5f5; color: #666; font-size: 12px;">
        <div style="margin-bottom: 10px;">⏳ Loading image...</div>
      </div>
      <div style="display:none; padding: 20px; text-align: center; background: #f5f5f5; color: #666;">
        📷 No image available for this location
      </div>
     </div>`;
      
    const imageSourceText = place.imageSource === 'places_api' ? '📍 Place Photo' : '🛣️ Street View';
      
    return `
      <div class="info-window-content">
        <h3 class="info-window-title">${place.name || 'Unnamed Location'}</h3>
        ${photoHtml}
        <p class="info-window-address">${place.address || 'Address Unknown'}</p>
        <p class="info-window-image-source" style="font-size: 12px; color: #666; margin: 5px 0;">${imageSourceText}</p>
        <button id="add-place-btn" class="info-window-button" ${loading || imageLoading ? 'disabled' : ''}>
          ${loading ? 'Generating Music...' : imageLoading ? 'Adding...' : 'Add to Music Generation'}
        </button>
      </div>
    `;
  };

  // Update info window button state when loading states change
  useEffect(() => {
    if (selectedPlace) {
      // Refresh the info window content with updated button state
      const infoWindowContent = generateInfoWindowContent(selectedPlace);
      if (infoWindowRef.current) {
        infoWindowRef.current.setContent(infoWindowContent);
      }
    }
  }, [loading, imageLoading, selectedPlace]);

  // Handle filter mode changes
  useEffect(() => {
    if (!mapLoaded) return;
    
    // Close info window and clear selected place
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
    setSelectedPlace(null);
    
    if (activeFilters.length === 0) {
      // No filter mode: show main marker, enable map clicks
      clearPlaceMarkers();
      if (markerRef.current) {
        markerRef.current.setVisible(true);
      }
      addMapClickListener(mapRef.current, markerRef.current, infoWindowRef.current, placesServiceRef.current);
    } else {
      // Filter mode: hide main marker, disable map clicks
      if (markerRef.current) {
        markerRef.current.setVisible(false);
      }
      removeMapClickListener();
      
      // Search for new filter types
      const newFilters = activeFilters.filter(filter => 
        !placeMarkers.some(marker => marker.placeType === filter)
      );
      
      newFilters.forEach(filter => {
        searchPlacesByType(filter);
      });
      
      // Remove markers for deselected filter types
      const markersToRemove = placeMarkers.filter(marker => 
        !activeFilters.includes(marker.placeType)
      );
      
      markersToRemove.forEach(markerData => {
        markerData.marker.setMap(null);
      });
      
      setPlaceMarkers(prevMarkers => 
        prevMarkers.filter(marker => activeFilters.includes(marker.placeType))
      );
    }
  }, [activeFilters, mapLoaded]);

  // Handle filter change
  const handleFilterChange = (placeType) => {
    setActiveFilters(prev => 
      prev.includes(placeType)
        ? prev.filter(filter => filter !== placeType)
        : [...prev, placeType]
    );
  };

  // Search places by type
  const searchPlacesByType = (placeType) => {
    if (!mapLoaded || !placesServiceRef.current) return;
    
    const center = mapRef.current.getCenter();
    const bounds = mapRef.current.getBounds();
    
    const request = {
      location: center,
      radius: bounds ? null : 1000,
      bounds: bounds,
      type: placeType
    };
    
    placesServiceRef.current.nearbySearch(request, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK) {
        const placeTypeInfo = placeTypes.find(type => type.id === placeType);
        
        const newMarkers = results.map(place => {
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

          marker.addListener('click', () => {
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

          return { marker, placeType };
        });
        
        setPlaceMarkers(prevMarkers => [...prevMarkers, ...newMarkers]);
      }
    });
  };
  
  // Clear all place markers
  const clearPlaceMarkers = () => {
    placeMarkers.forEach(markerData => {
      markerData.marker.setMap(null);
    });
    setPlaceMarkers([]);
  };

// uploadImages 
const uploadImages = async (images) => {
  const formData = new FormData();
  images.forEach((image, index) => {
    console.log(`Adding image ${index}:`, image.name, image.size, image.type);
    formData.append('images', image);
  });

  try {
    const response = await fetch('/api/upload-images', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    console.log('Upload result:', result);
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to upload images');
    }

    return result.image_paths;
  } catch (error) {
    console.error('Image upload failed:', error);
    throw error; // 不要静默失败
  }
};

// 修改：处理音乐生成，使用地点名称字符串
const handleGenerateMusic = async () => {
  // 前置检查
  if (images.length === 0) {
    setError('Please upload at least one image.');
    return;
  }
  
  // 修改：检查是否有带地点信息的图片
  const locationsWithPlace = previews.filter(preview => preview.location);
  if (locationsWithPlace.length === 0) {
    setError('Please add at least one location from the map.');
    return;
  }

  setLoading(true);
  setError(null);
  setTaskStatus(null);
  setCurrentTaskId(null);

  try {
    // 修改：使用地点名称字符串
    const locationString = generateLocationString();
    console.log('Sending location string to API:', locationString);
    
    // Step 1: 上传图片
    console.log('Uploading images...');
    const uploadResult = await musicApi.uploadImages(images);
    console.log('Upload result:', uploadResult);
    
    if (!uploadResult.image_paths || uploadResult.image_paths.length === 0) {
      throw new Error('Failed to upload images: No image paths returned');
    }

    // Step 2: 创建音乐生成任务
    console.log('Creating music generation task...');
    const taskResult = await musicApi.createMusicTask({
      imagePaths: uploadResult.image_paths,
      location: locationString, // 修改：传递地点名称字符串
      userId: null // 可以根据需要添加用户ID
    });
    
    console.log('Task created:', taskResult);
    const taskId = taskResult.task_id;
    setCurrentTaskId(taskId);

    // Step 3: 轮询任务状态
    console.log('Starting task polling...');
    const finalResult = await musicApi.pollTaskStatus(taskId, {
      interval: 10000, // 3秒轮询一次
      maxAttempts: 100, // 最多轮询5分钟
      onUpdate: (status) => {
        console.log('Task status update:', status);
        setTaskStatus(status);
      }
    });

    console.log('Final result:', finalResult);

    // Step 4: 处理完成结果
    if (finalResult.status === TASK_STATUS.COMPLETED) {
      let audioUrl;
      
      // 处理音频URL
      if (finalResult.music_url) {
        audioUrl = finalResult.music_url;
      } else if (finalResult.result && finalResult.result.audio_url) {
        audioUrl = finalResult.result.audio_url;
      } else if (finalResult.result && finalResult.result.audio_data) {
        // 如果返回的是二进制数据
        const audioBlob = new Blob([finalResult.result.audio_data], { type: 'audio/wav' });
        audioUrl = URL.createObjectURL(audioBlob);
      } else {
        throw new Error('No audio URL or data found in completed task');
      }
      
      // 清理之前的音乐URL
      if (music && music.url && music.url.startsWith('blob:')) {
        URL.revokeObjectURL(music.url);
      }
      
      // 设置新的音乐
      setMusic({ 
        url: audioUrl,
        title: finalResult.music_title,
        description: finalResult.music_description,
        analysis: finalResult
      });
      
      setTaskStatus(null);
      setCurrentTaskId(null);
    } else {
      throw new Error(finalResult.error_message || 'Music generation failed');
    }
    
  } catch (error) {
    console.error('Music generation error:', error);
    setError(`Failed to generate music: ${error.message}`);
    setTaskStatus(null);
    setCurrentTaskId(null);
  } finally {
    setLoading(false);
  }
};

  // 验证图片是否可用
  const validateImageUrl = async (imageUrl) => {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.error('Image validation failed:', error);
      return false;
    }
  };

  // 简化：自动添加地点和图片
  const addPlaceToMusicGenerator = async () => {
    if (!selectedPlace || !selectedPlace.displayImageUrl) {
      setError('No location or image selected.');
      return;
    }
    
    try {
      setImageLoading(true);
      
      // 验证图片是否可用
      const isImageValid = await validateImageUrl(selectedPlace.displayImageUrl);
      if (!isImageValid) {
        throw new Error('Selected image is not available. Please try another location.');
      }
      
      // 获取地点名称
      const placeName = await getPlaceName(
        selectedPlace.position.lat, 
        selectedPlace.position.lng, 
        selectedPlace
      );
      
      // Fetch image
      const response = await fetch(selectedPlace.displayImageUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch image from the selected location.');
      }
      
      const blob = await response.blob();
      
      const timestamp = Date.now();
      const fileName = `place_${placeName.replace(/\s+/g, '_')}_${timestamp}.jpg`;
      const photoFile = new File([blob], fileName, { type: 'image/jpeg' });
      
      // 验证文件
      try {
        utils.validateImageFile(photoFile);
      } catch (validationError) {
        throw new Error(`Invalid image file: ${validationError.message}`);
      }
      
      // Add to images
      setImages(prev => [...prev, photoFile]);
      
      // Create preview with location info
      const newPreview = {
        file: photoFile,
        url: URL.createObjectURL(photoFile),
        id: timestamp,
        location: {
          lat: selectedPlace.position.lat,
          lng: selectedPlace.position.lng,
          name: placeName,
          address: selectedPlace.address
        }
      };
      
      setPreviews(prev => [...prev, newPreview]);
      
      // 关闭信息窗口
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }
      
      setSelectedPlace(null);
      setImageLoading(false);
      
    } catch (err) {
      setError(`Failed to add image from location: ${err.message}`);
      setImageLoading(false); 
      console.error('Failed to fetch image:', err);
    }
  };
  
  // 简化：监听信息窗口按钮点击事件
  useEffect(() => {
    const handleInfoWindowButtonClick = (e) => {
      if (e.target && e.target.id === 'add-place-btn') {
        addPlaceToMusicGenerator();
      }
    };

    document.addEventListener('click', handleInfoWindowButtonClick);
    return () => document.removeEventListener('click', handleInfoWindowButtonClick);
  }, [selectedPlace]);

  // Handle image upload
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    
    try {
      // 使用 API 中的文件验证
      utils.validateImageFiles(files);
      
      setImages(prev => [...prev, ...files]);
      
      const newPreviews = files.map(file => ({
        file,
        url: URL.createObjectURL(file),
        id: Date.now() + Math.random(),
        location: null // 手动上传的图片没有地点信息
      }));
      
      setPreviews(prev => [...prev, ...newPreviews]);
      
      // 清除之前的错误
      setError(null);
      
    } catch (error) {
      setError(`File validation failed: ${error.message}`);
      console.error('File validation error:', error);
    }
  };
  
  // 修改：删除图片，联动删除对应的地点信息
  const removeImage = (indexToRemove) => {
    URL.revokeObjectURL(previews[indexToRemove].url);
    
    setImages(prev => prev.filter((_, index) => index !== indexToRemove));
    setPreviews(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  // Download music
  const downloadMusic = () => {
    if (!music) return;
    
    const a = document.createElement('a');
    a.href = music.url;
    a.download = 'generated_music.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Music playback handlers
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
    setActiveFilters([]);
    clearPlaceMarkers();
    if (markerRef.current) {
      markerRef.current.setVisible(false);
    }
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
  };
  
  const showImageMarkersSequentially = () => {
    const imagesWithLocation = previews.filter(preview => preview.location);
    if (imagesWithLocation.length === 0) return;
    
    // Fit map bounds to include all markers
    const bounds = new window.google.maps.LatLngBounds();
    imagesWithLocation.forEach(preview => {
      bounds.extend({ lat: preview.location.lat, lng: preview.location.lng });
    });
    mapRef.current.fitBounds(bounds);
    
    // Calculate intervals based on audio duration
    const audioElement = document.querySelector('.audio-player');
    const audioDuration = audioElement ? audioElement.duration : 10;
    const interval = audioDuration / imagesWithLocation.length * 1000;
    
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
    musicMarkers.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null);
      }
    });
    setMusicMarkers([]);
    
    // Restore main marker
    if (markerRef.current) {
      markerRef.current.setVisible(true);
    }
    
    // Restore map click listener if no filters active
    if (activeFilters.length === 0) {
      addMapClickListener(mapRef.current, markerRef.current, infoWindowRef.current, placesServiceRef.current);
    }
  };

  // Cleanup music markers when music changes
  useEffect(() => {
    return () => {
      musicMarkers.forEach(marker => {
        if (marker && marker.setMap) {
          marker.setMap(null);
        }
      });
    };
  }, [music]);

  return (
    <div className="map-music-container">
      {/* Left map area */}
      <div className="map-container">
        <div className="form-group">
          <div className="search-input-container">
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search address or place name"
              value={searchQuery}
              onChange={handleSearchInputChange}
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
        
        <div ref={googleMapRef} className="google-map" />
      </div>
    
      
      {/* Right control panel */}
      <div className="sidebar-container">
        <div className="music-generator">
          <h2>Tune Scape</h2>
          
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
                    {/* 显示地点信息 */}
                    {preview.location && (
                      <div className="image-location-tag">
                        📍 {preview.location.name}
                      </div>
                    )}
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
          
         
          {/* <div className="form-group">
            <strong>Location Information</strong>
            

            <div className="location-summary">
              <div className="location-summary-header">
                Places to Include in Music ({getUniqueLocations().length}):
              </div>
              
              {getUniqueLocations().length === 0 ? (
                <div className="no-locations">
                  No locations selected. Click on the map or use filters to add places.
                </div>
              ) : (
                <div className="locations-summary-list">
                  {getUniqueLocations().map((location, index) => (
                    <div key={`${location.lat}-${location.lng}`} className="location-summary-item">
                      <span className="location-number">{index + 1}.</span>
                      <div className="location-details">
                        <div className="location-name">{location.name}</div>
                        {location.count > 1 && (
                          <div className="location-count">({location.count} images)</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="current-location-info">
              {locationName && (
                <div className="location-name">
                  <strong>Current Map Center:</strong> <br />
                  {locationName}
                </div>
              )}
            </div>
            
            <p className="map-tip">
              {activeFilters.length === 0 
                ? "Click anywhere on the map to add a location with its image to your music generation." 
                : "Filter mode active: Click on filtered places to add them."}
            </p>
          </div> */}
          
          <button 
            className="generate-button" 
            onClick={handleGenerateMusic} 
            disabled={loading || !apiAvailable || getUniqueLocations().length === 0}
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
              onPlay={handleMusicPlay}
              onPause={handleMusicPause}
              onEnded={handleMusicEnd}
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
            locationName={generateLocationString() || locationName}
            musicAnalysis={{
              prompt: music?.analysis?.sono_response?.response?.sunoData?.[0]?.prompt || null,
              visual_analysis: music?.analysis?.visual_analysis,
              tags: music?.analysis?.sono_response?.response?.sunoData?.[0]?.tags || null,
              analysis: music?.analysis
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default MusicGenerator;