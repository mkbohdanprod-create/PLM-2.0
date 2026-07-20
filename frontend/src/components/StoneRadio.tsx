import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Radio, Volume2, VolumeX, Music } from 'lucide-react';

const STREAM_URL = 'https://icecast.omroep.nl/3fm-bb-mp3'; // Temporary internet radio for testing

export function StoneRadio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    setError(null);
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.src = STREAM_URL;
      audioRef.current.play().catch(e => {
        console.error("Audio playback failed", e);
        setError("Помилка відтворення. Можливо, потік недоступний або заблокований браузером.");
        setIsPlaying(false);
      });
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMuted = !isMuted;
    audioRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    if (val === 0) setIsMuted(true);
    else if (isMuted) setIsMuted(false);
  };

  return (
    <>
      <style>{`
        .stone-radio-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .stone-radio-panel {
          width: 320px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 16px;
          margin-bottom: 16px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          transform-origin: bottom right;
        }
        .stone-radio-panel.collapsed {
          opacity: 0;
          transform: scale(0.95) translateY(20px);
          pointer-events: none;
        }
        .stone-radio-header {
          padding: 16px;
          background: linear-gradient(135deg, #9333ea, #2563eb);
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .stone-radio-title {
          font-weight: bold;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .stone-radio-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .stone-radio-track-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .stone-radio-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(to top right, #a855f7, #22d3ee);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
          flex-shrink: 0;
        }
        .stone-radio-text {
          flex: 1;
          overflow: hidden;
        }
        .stone-radio-text h4 {
          margin: 0;
          font-size: 14px;
          color: #18181b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .stone-radio-text p {
          margin: 0;
          font-size: 12px;
          color: #71717a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .stone-radio-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: bold;
          margin-top: 4px;
        }
        .stone-radio-badge.live {
          background: #d1fae5;
          color: #047857;
        }
        .stone-radio-badge.error {
          background: #fee2e2;
          color: #b91c1c;
        }
        .stone-radio-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .stone-radio-play-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #18181b;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s;
        }
        .stone-radio-play-btn:hover {
          background: #27272a;
          transform: scale(1.05);
        }
        .stone-radio-volume {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          color: #a1a1aa;
        }
        .stone-radio-volume input {
          flex: 1;
          accent-color: #9333ea;
          cursor: pointer;
        }
        .stone-radio-error-box {
          background: #fef2f2;
          color: #dc2626;
          font-size: 12px;
          padding: 8px 16px;
          text-align: center;
          border-top: 1px solid #fee2e2;
        }
        .stone-radio-footer {
          background: #fafafa;
          padding: 12px 16px;
          text-align: center;
          border-top: 1px solid rgba(0,0,0,0.05);
        }
        .stone-radio-footer button {
          font-size: 12px;
          font-weight: bold;
          color: #9333ea;
          text-transform: uppercase;
          background: none;
          border: none;
          cursor: pointer;
        }
        .stone-radio-footer button:hover {
          color: #7e22ce;
        }
        .stone-radio-toggle {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a855f7, #3b82f6);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
          cursor: pointer;
          transition: transform 0.2s;
        }
        .stone-radio-toggle:hover {
          transform: scale(1.1);
        }
        @keyframes stone-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .stone-animate-pulse {
          animation: stone-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      <div className="stone-radio-container">
        <div className={`stone-radio-panel ${isExpanded ? '' : 'collapsed'}`}>
          <div className="stone-radio-header">
            <div className="stone-radio-title">
              <Radio size={20} className="stone-animate-pulse" />
              <span>STONE Radio</span>
            </div>
          </div>
          
          <div className="stone-radio-body">
            <div className="stone-radio-track-info">
              <div className="stone-radio-icon-wrap">
                <Music size={24} color="white" />
              </div>
              <div className="stone-radio-text">
                <h4>Viyar Stone FM</h4>
                <p>Work & Chill Stream</p>
                {error ? (
                  <div className="stone-radio-badge error">Помилка</div>
                ) : (
                  <div className="stone-radio-badge live">LIVE</div>
                )}
              </div>
            </div>

            <div className="stone-radio-controls">
              <button onClick={togglePlay} className="stone-radio-play-btn">
                {isPlaying ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} />}
              </button>
              <div className="stone-radio-volume">
                <button onClick={toggleMute} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                  {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={isMuted ? 0 : volume} 
                  onChange={handleVolumeChange}
                />
              </div>
            </div>
          </div>
          
          {error && (
            <div className="stone-radio-error-box">
              {error}
            </div>
          )}

          <div className="stone-radio-footer">
            <button>+ Замовити пісню (Незабаром)</button>
          </div>
        </div>

        <audio 
          ref={audioRef} 
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            setError("Потік тимчасово недоступний");
            setIsPlaying(false);
          }}
          crossOrigin="anonymous"
        />

        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="stone-radio-toggle"
        >
          <Radio size={28} />
        </button>
      </div>
    </>
  );
}
