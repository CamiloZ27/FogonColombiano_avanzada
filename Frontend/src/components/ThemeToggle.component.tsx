import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface Props {
  compact?: boolean;
}

export const ThemeToggle: React.FC<Props> = ({ compact = false }) => {
  const { isLight, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle ${isLight ? 'is-day' : 'is-night'} ${compact ? 'is-compact' : ''}`}
      aria-label={isLight ? 'Cambiar a modo noche' : 'Cambiar a modo día'}
      title={isLight ? 'Cambiar a modo noche' : 'Cambiar a modo día'}
    >
      <span className="theme-toggle-track">
        {/* Estrellas (visibles en modo noche) */}
        <span className="theme-stars" aria-hidden="true">
          <span className="star s1" />
          <span className="star s2" />
          <span className="star s3" />
        </span>

        {/* Nubes suaves (visibles en modo día) */}
        <span className="theme-clouds" aria-hidden="true">
          <span className="cloud c1" />
          <span className="cloud c2" />
        </span>

        {/* Esfera deslizante con Sol / Luna animados */}
        <span className="theme-thumb">
          {isLight ? (
            <svg className="theme-icon icon-sun" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="2" x2="12" y2="4.5" />
                <line x1="12" y1="19.5" x2="12" y2="22" />
                <line x1="2" y1="12" x2="4.5" y2="12" />
                <line x1="19.5" y1="12" x2="22" y2="12" />
                <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
                <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
                <line x1="19.1" y1="4.9" x2="17.3" y2="6.7" />
                <line x1="6.7" y1="17.3" x2="4.9" y2="19.1" />
              </g>
            </svg>
          ) : (
            <svg className="theme-icon icon-moon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
              />
            </svg>
          )}
        </span>
      </span>

      {!compact && (
        <span className="theme-toggle-label">
          {isLight ? 'Modo Día' : 'Modo Noche'}
        </span>
      )}
    </button>
  );
};

