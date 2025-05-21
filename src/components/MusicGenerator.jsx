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
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const googleMapRef = useRef(null);

  // Check API service availability
  useEffect(() => {
    const checkApi = async () => {
      const isAvailable = await checkApiHealth();
      setApiAvailable(isAvailable);
      if (!isAvailable) {
        setError('Unable to connect to music generation service. Please ensure the API server is running.');
      }
    };
    
    checkApi();
  }, []);

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

    // 修改默认位置为米兰大教堂 (Milan Duomo)
    const duomoPosition = { lat: 45.4641, lng: 9.1919 };

    const map = new window.google.maps.Map(googleMapRef.current, {
      center: duomoPosition,
      zoom: 16, // 放大一点以便看清楚米兰大教堂
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    // Create marker
    const marker = new window.google.maps.Marker({
      position: duomoPosition,
      map: map,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
    });

    // Create info window
    const infoWindow = new window.google.maps.InfoWindow({
      maxWidth: 300
    });

    // Create Places service
    const placesService = new window.google.maps.places.PlacesService(map);

    // 初始加载时为米兰大教堂显示信息窗口
    setTimeout(() => {
      fetchPlaceDetailsAndShowInfoWindow(duomoPosition.lat, duomoPosition.lng, marker, map, infoWindow, placesService);
      
      // 同时更新坐标状态
      setCoordinates({
        latitude: duomoPosition.lat,
        longitude: duomoPosition.lng
      });
    }, 1000);

    // Add marker on map click
    map.addListener('click', async (event) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      
      marker.setPosition(event.latLng);
      setCoordinates({
        latitude: lat,
        longitude: lng
      });

      // 获取并显示位置信息
      fetchPlaceDetailsAndShowInfoWindow(lat, lng, marker, map, infoWindow, placesService);
    });

    // Update coordinates on marker drag
    marker.addListener('dragend', async () => {
      const position = marker.getPosition();
      const lat = position.lat();
      const lng = position.lng();
      
      setCoordinates({
        latitude: lat,
        longitude: lng
      });

      // 获取并显示位置信息
      fetchPlaceDetailsAndShowInfoWindow(lat, lng, marker, map, infoWindow, placesService);
    });

    mapRef.current = map;
    markerRef.current = marker;
    infoWindowRef.current = infoWindow;
    setMapLoaded(true);
  };

  // 获取位置详情并显示信息窗口
  const fetchPlaceDetailsAndShowInfoWindow = async (lat, lng, marker, map, infoWindow, placesService) => {
    try {
      // 先用反向地理编码获取基本地址信息
      const geoResult = await reverseGeocode({ latitude: lat, longitude: lng });
      
      // 使用 Places API 搜索附近地点
      const request = {
        location: new window.google.maps.LatLng(lat, lng),
        radius: '50', // 缩小搜索半径获取更精确的结果
        // rankBy: window.google.maps.places.RankBy.DISTANCE // 按距离排序
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
                  })) : [],
                  placeId: place.place_id,
                  position: { lat, lng }
                };
                
                setSelectedPlace(detailedPlace);

                // 生成并显示信息窗口内容
                const infoWindowContent = generateInfoWindowContent(detailedPlace, lat, lng);
                infoWindow.setContent(infoWindowContent);
                infoWindow.open({
                  anchor: marker,
                  map,
                });
              } else {
                // 如果找不到详细信息，使用地理编码结果
                const fallbackPlace = {
                  name: geoResult.address.split(',')[0],
                  address: geoResult.address,
                  photos: [],
                  position: { lat, lng }
                };
                setSelectedPlace(fallbackPlace);

                // 生成并显示信息窗口内容
                const infoWindowContent = generateInfoWindowContent(fallbackPlace, lat, lng);
                infoWindow.setContent(infoWindowContent);
                infoWindow.open({
                  anchor: marker,
                  map,
                });
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

          // 生成并显示信息窗口内容
          const infoWindowContent = generateInfoWindowContent(fallbackPlace, lat, lng);
          infoWindow.setContent(infoWindowContent);
          infoWindow.open({
            anchor: marker,
            map,
          });
        }
      });
    } catch (error) {
      console.error('Failed to get place information:', error);
    }
  };

  // Generate info window content
  const generateInfoWindowContent = (place, lat, lng) => {
    // 为信息窗口添加街景照片
    let photoHtml = '';
    
    if (place.photos && place.photos.length > 0) {
      photoHtml = `<div class="info-window-photo">
        <img src="${place.photos[0].getUrl ? place.photos[0].getUrl({ maxWidth: 300, maxHeight: 200 }) : place.photos[0].url}" alt="${place.name}">
       </div>`;
    } else {
      // 如果没有照片，尝试使用街景静态图像
      const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=300x200&location=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
      photoHtml = `<div class="info-window-photo">
        <img src="${streetViewUrl}" alt="Street View">
       </div>`;
    }
      
    return `
      <div class="info-window-content">
        <h3 class="info-window-title">${place.name || 'Unnamed Location'}</h3>
        ${photoHtml}
        <p class="info-window-address">${place.address || 'Address Unknown'}</p>
        <button id="add-to-music-btn" class="info-window-button">Add to Music Generation</button>
      </div>
    `;
  };

  // Add place photos to music generator
  const addPlaceToMusicGenerator = () => {
    if (!selectedPlace) {
      setError('No location selected.');
      return;
    }
    
    // 如果有照片，使用照片，否则尝试获取街景照片
    if (selectedPlace.photos && selectedPlace.photos.length > 0) {
      fetchPhotosForMusicGeneration(selectedPlace.photos);
    } else {
      // 使用 Google Street View 静态图像 API 获取街景照片
      fetchStreetViewPhotos();
    }
  };
  
  // 获取地点照片
  const fetchPhotosForMusicGeneration = async (photos) => {
    try {
      setLoading(true);
      
      const photoPromises = photos.slice(0, 3).map(async (photo, index) => {
        const response = await fetch(photo.url);
        const blob = await response.blob();
        return new File([blob], `place_${selectedPlace.name.replace(/\s+/g, '_')}_${index}.jpg`, { type: 'image/jpeg' });
      });
      
      const photoFiles = await Promise.all(photoPromises);
      
      // 更新图片和预览
      setImages(photoFiles);
      
      // 创建新预览
      const newPreviews = photoFiles.map(file => ({
        file,
        url: URL.createObjectURL(file)
      }));
      
      // 清除旧预览
      previews.forEach(preview => URL.revokeObjectURL(preview.url));
      
      setPreviews(newPreviews);
      setLoading(false);
    } catch (err) {
      setError('Failed to get place photos.');
      setLoading(false);
      console.error('Failed to fetch photos:', err);
    }
  };
  
  // 获取街景照片
  const fetchStreetViewPhotos = async () => {
    if (!selectedPlace) return;
    
    try {
      setLoading(true);
      
      // 创建四个不同视角的街景照片（北、东、南、西）
      const headings = [0, 90, 180, 270];
      const photoPromises = headings.slice(0, 3).map(async (heading, index) => {
        const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${selectedPlace.position.lat},${selectedPlace.position.lng}&heading=${heading}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
        const response = await fetch(streetViewUrl);
        const blob = await response.blob();
        return new File([blob], `streetview_${selectedPlace.name.replace(/\s+/g, '_')}_${index}.jpg`, { type: 'image/jpeg' });
      });
      
      const photoFiles = await Promise.all(photoPromises);
      
      // 更新图片和预览
      setImages(photoFiles);
      
      // 创建新预览
      const newPreviews = photoFiles.map(file => ({
        file,
        url: URL.createObjectURL(file)
      }));
      
      // 清除旧预览
      previews.forEach(preview => URL.revokeObjectURL(preview.url));
      
      setPreviews(newPreviews);
      setLoading(false);
    } catch (err) {
      setError('Failed to get street view photos.');
      setLoading(false);
      console.error('Failed to fetch street view:', err);
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
      
      markerRef.current.setPosition(position);
      mapRef.current.panTo(position);
      
      // 如果坐标是通过手动输入更新的，也需要获取和显示位置信息
      if (markerRef.current && infoWindowRef.current && mapRef.current) {
        const placesService = new window.google.maps.places.PlacesService(mapRef.current);
        fetchPlaceDetailsAndShowInfoWindow(
          position.lat, 
          position.lng, 
          markerRef.current, 
          mapRef.current, 
          infoWindowRef.current,
          placesService
        );
      }
    }
  }, [coordinates, mapLoaded]);

  // Handle image upload
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    setImages(files);
    
    // Create previews
    const newPreviews = files.map(file => ({
      file,
      url: URL.createObjectURL(file)
    }));
    
    // Clean up old preview URLs
    previews.forEach(preview => URL.revokeObjectURL(preview.url));
    
    setPreviews(newPreviews);
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
            markerRef.current.setPosition(location);
            mapRef.current.panTo(location);
            mapRef.current.setZoom(15);
            
            // 获取和显示当前位置的信息
            const placesService = new window.google.maps.places.PlacesService(mapRef.current);
            fetchPlaceDetailsAndShowInfoWindow(
              lat, 
              lng, 
              markerRef.current, 
              mapRef.current, 
              infoWindowRef.current,
              placesService
            );
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
                  <img 
                    key={index} 
                    src={preview.url} 
                    alt={`Preview ${index + 1}`} 
                    className="image-preview" 
                  />
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
              <button 
                onClick={getCurrentLocation} 
                disabled={loading}
                type="button"
              >
                Get Current Location
              </button>
            </div>
            <p className="map-tip">You can also click on the map to select a location.</p>
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