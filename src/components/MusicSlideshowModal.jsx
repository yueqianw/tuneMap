import React, { useState, useEffect, useRef } from 'react';
import './MusicSlideshowModal.css';

const MusicSlideshowModal = ({ 
  isOpen, 
  onClose, 
  musicUrl, 
  images
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  
  // 图片轮播间隔（毫秒）
  const SLIDE_INTERVAL = 2500;
  
  // 开始图片轮播
  const startSlideshow = () => {
    if (images.length <= 1) return;
    
    intervalRef.current = setInterval(() => {
      setCurrentImageIndex(prev => (prev + 1) % images.length);
    }, SLIDE_INTERVAL);
  };
  
  // 停止图片轮播
  const stopSlideshow = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  
  // 播放/暂停音乐
  const togglePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      stopSlideshow();
    } else {
      audioRef.current.play();
      startSlideshow();
    }
    setIsPlaying(!isPlaying);
  };
  
  // 音频事件处理
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handlePlay = () => {
      setIsPlaying(true);
      startSlideshow();
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      stopSlideshow();
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      stopSlideshow();
      setCurrentImageIndex(0);
    };
    
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);
  
  // 清理定时器
  useEffect(() => {
    return () => {
      stopSlideshow();
    };
  }, []);
  
  // 重置状态当模态框关闭
  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      setCurrentImageIndex(0);
      stopSlideshow();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        
        <div className="slideshow-container">
          <h2 className="slideshow-title">Generated Music Experience</h2>
          
          {/* 图片展示区域 */}
          <div className="image-container">
            {images && images.length > 0 ? (
              <img 
                src={images[currentImageIndex]?.url || URL.createObjectURL(images[currentImageIndex])} 
                alt={`Slide ${currentImageIndex + 1}`}
                className="slideshow-image"
              />
            ) : (
              <div className="no-image-placeholder">
                <div className="music-icon">🎵</div>
                <p>Music Experience</p>
              </div>
            )}
            
            {/* 图片指示器 */}
            {images && images.length > 1 && (
              <div className="image-indicators">
                {images.map((_, index) => (
                  <span 
                    key={index}
                    className={`indicator ${index === currentImageIndex ? 'active' : ''}`}
                    onClick={() => setCurrentImageIndex(index)}
                  />
                ))}
              </div>
            )}
          </div>
          
          {/* 音频控制区域 */}
          <div className="audio-controls">
            <audio 
              ref={audioRef}
              src={musicUrl}
              preload="auto"
            />
            
            <button 
              className={`play-pause-btn ${isPlaying ? 'playing' : ''}`}
              onClick={togglePlayPause}
            >
              {isPlaying ? '⏸️' : '▶️'}
            </button>
            
            <span className="audio-status">
              {isPlaying ? 'Playing...' : 'Paused'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicSlideshowModal;
