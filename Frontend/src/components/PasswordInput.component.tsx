import React, { useState } from 'react';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}

/**
 * Campo de contraseña con botón de "Fogoncito":
 * - Oculta: fogón en reposo (brasas apagadas).
 * - Visible: fogón encendido con llama animada.
 */
export const PasswordInput: React.FC<PasswordInputProps> = ({ className, ...props }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-fogon-wrap">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`password-fogon-input ${className ?? ''}`.trim()}
      />
      <button
        type="button"
        className={`fogon-toggle-btn ${visible ? 'is-lit' : 'is-off'}`}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={visible ? 'Apagar fogoncito (ocultar)' : 'Encender fogoncito (ver contraseña)'}
      >
        <svg viewBox="0 0 28 28" width="22" height="22" className="fogon-svg" aria-hidden="true">
          {/* Llama animada cuando el fogoncito está encendido */}
          {visible ? (
            <g className="fogon-flame-group">
              <path
                className="fogon-flame-outer"
                d="M14 2.5C14 2.5 19.5 7.5 19.5 12.2C19.5 15.2 17.1 17.5 14 17.5C10.9 17.5 8.5 15.2 8.5 12.2C8.5 9.8 10.1 7.6 11.4 6.2C11.1 7.8 12.1 8.8 12.1 8.8C12.1 8.8 12.4 5.2 14 2.5Z"
                fill="#F59E0B"
              />
              <path
                className="fogon-flame-inner"
                d="M14 7.4C14 7.4 16.9 10.2 16.9 12.8C16.9 14.5 15.6 15.8 14 15.8C12.4 15.8 11.1 14.5 11.1 12.8C11.1 11.2 12.7 9 14 7.4Z"
                fill="#FEF08A"
              />
            </g>
          ) : (
            /* Humo sutil en reposo cuando la contraseña está oculta */
            <g className="fogon-smoke" opacity="0.55">
              <path
                d="M11.5 12.5C11 10.8 12.4 9.7 11.8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M16 12C15.5 10.3 17 9.1 16.3 7.2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </g>
          )}

          {/* Troncos de leña cruzados */}
          <path
            d="M6.5 19.5L21.5 16.5"
            stroke={visible ? '#B45309' : 'currentColor'}
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <path
            d="M6.5 16.5L21.5 19.5"
            stroke={visible ? '#92400E' : 'currentColor'}
            strokeWidth="2.3"
            strokeLinecap="round"
          />

          {/* Base de barro/piedra del fogoncito */}
          <path
            d="M4.5 21.5C4.5 20.6 5.2 20 6.1 20H21.9C22.8 20 23.5 20.6 23.5 21.5V22.2C23.5 23.8 22.1 25 20.5 25H7.5C5.9 25 4.5 23.8 4.5 22.2V21.5Z"
            fill={visible ? '#B5651D' : 'currentColor'}
            opacity={visible ? 1 : 0.72}
          />
          {/* Brasa central */}
          <ellipse
            cx="14"
            cy="22.5"
            rx="3.4"
            ry="1.2"
            fill={visible ? '#FDE047' : '#7d6a54'}
          />
        </svg>
      </button>
    </div>
  );
};

