import React, { useState, useEffect, useRef } from 'react';
import './MusicSlideshowModal.css';

const MusicSlideshowModal = ({ 
  isOpen, 
  onClose, 
  musicUrl, 
  images,
  musicAnalysis = null
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
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
      setProgress(0);
    };

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    
    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
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
      setProgress(0);
      stopSlideshow();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isOpen]);

  // 格式化歌词显示
  const formatLyrics = (prompt) => {
    if (!prompt) return '';
    return prompt.split('\n').map((line, index) => {
      if (line.trim() === '') return <br key={index} />;
      if (line.includes('(Verse') || line.includes('(Chorus)')) {
        return <h4 key={index} className="lyrics-section">{line}</h4>;
      }
      return <p key={index} className="lyrics-line">{line}</p>;
    });
  };

  // 格式化标签显示
  const formatTags = (tags) => {
    if (!tags) return [];
    if (typeof tags === 'string') {
      return tags.split(',').map(tag => tag.trim());
    }
    return tags;
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        
        <div className="slideshow-container">
          
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
          <div className="audio-player-container">
            <audio 
              ref={audioRef}
              src={musicUrl}
              preload="auto"
            />
            
            <div className="player-controls">
              <button 
                className={`play-button ${isPlaying ? 'playing' : ''}`}
                onClick={togglePlayPause}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                <div className="play-icon">
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1"/>
                      <rect x="14" y="4" width="4" height="16" rx="1"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </div>
              </button>
              
              <div className="player-info">
                <div className="player-status">
                  {isPlaying ? 'Now Playing' : 'Ready to Play'}
                </div>
                <div className="player-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 音乐分析信息 */}
          {musicAnalysis && (
            <div className="music-analysis">
              {/* 歌词部分 */}
              {musicAnalysis.prompt && (
                <div className="analysis-section lyrics-section">
                  <h3 className="section-title">
                    <span className="section-icon">🎵</span>
                    Lyrics
                  </h3>
                  <div className="lyrics-content">
                    {formatLyrics(musicAnalysis.prompt)}
                  </div>
                </div>
              )}

              {/* 视觉分析部分
              {musicAnalysis.visual_analysis && (
                <div className="analysis-section visual-analysis-section">
                  <h3 className="section-title">
                    <span className="section-icon">👁️</span>
                    Visual Analysis
                  </h3>
                  <div className="visual-analysis-content">
                    <p>{musicAnalysis.visual_analysis}</p>
                  </div>
                </div>
              )} */}

              {/* 音乐标签部分 */}
              {musicAnalysis.tags && (
                <div className="analysis-section tags-section">
                  <h3 className="section-title">
                    <span className="section-icon">🏷️</span>
                    Music Style & Tags
                  </h3>
                  <div className="tags-content">
                    {formatTags(musicAnalysis.tags).map((tag, index) => (
                      <span key={index} className="music-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 额外分析信息 */}
              {/* {musicAnalysis.analysis && (
                <div className="analysis-section details-section">
                  <h3 className="section-title">
                    <span className="section-icon">🎼</span>
                    Musical Details
                  </h3>
                  <div className="details-content">
                    {musicAnalysis.analysis.mood && (
                      <div className="detail-item">
                        <strong>Mood:</strong>
                        <div className="mood-tags">
                          {musicAnalysis.analysis.mood.map((mood, index) => (
                            <span key={index} className="mood-tag">{mood}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {musicAnalysis.analysis.tempo && (
                      <div className="detail-item">
                        <strong>Tempo:</strong> {musicAnalysis.analysis.tempo}
                      </div>
                    )}
                    {musicAnalysis.analysis.key && (
                      <div className="detail-item">
                        <strong>Key:</strong> {musicAnalysis.analysis.key}
                      </div>
                    )}
                    {musicAnalysis.analysis.instruments && (
                      <div className="detail-item">
                        <strong>Instruments:</strong>
                        <div className="instruments-list">
                          {musicAnalysis.analysis.instruments.map((instrument, index) => (
                            <span key={index} className="instrument-tag">{instrument}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )} */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MusicSlideshowModal;
