import React from 'react';
import { observer } from 'mobx-react-lite';
import { sberAuthStore, SberLoginStep } from './sber_auth_store';

export const SberLoginDialog = observer(() => {
  const { step, inputValue, isLoading, error, maskedLogin, attemptsRemain } = sberAuthStore;

  if (step === SberLoginStep.SUCCESS) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--success-color)' }}>
            ✓ Успешно!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
            Вы успешно вошли в аккаунт СберБанка.
          </p>
          <button
            onClick={() => sberAuthStore.reset()}
            className="btn btn-primary"
            style={{ width: '100%', background: '#21a038', color: '#fff', fontWeight: 600 }}
          >
            Готово
          </button>
        </div>
      </div>
    );
  }

  const getConfig = () => {
    switch (step) {
      case SberLoginStep.LOGIN:
        return {
          title: 'Вход в СберБанк',
          label: 'Номер телефона или номер карты',
          placeholder: '+7 999 123-45-67 или номер карты',
          type: 'text',
          inputMode: 'text' as const,
        };
      case SberLoginStep.SMS:
        return {
          title: 'Подтверждение СМС',
          label: maskedLogin ? `Код из СМС (отправлен для ${maskedLogin})` : 'Код из СМС',
          placeholder: '5 цифр',
          type: 'text',
          inputMode: 'numeric' as const,
        };
      default:
        return {
          title: 'Вход в СберБанк',
          label: 'Значение',
          placeholder: '',
          type: 'text',
          inputMode: 'text' as const,
        };
    }
  };

  const config = getConfig();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sberAuthStore.submit();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>{config.title}</h3>
          <button
            onClick={() => sberAuthStore.reset()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '24px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{config.label}</label>
            <input
              className="form-input"
              type={config.type}
              inputMode={config.inputMode}
              placeholder={config.placeholder}
              value={inputValue}
              disabled={isLoading}
              onChange={(e) => sberAuthStore.setInputValue(e.target.value)}
              required
              autoFocus
            />
          </div>

          {attemptsRemain !== null && attemptsRemain !== undefined && step === SberLoginStep.SMS && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Осталось попыток: <strong>{attemptsRemain}</strong>
            </div>
          )}

          {error && (
            <div className="error-banner" style={{ margin: '14px 0', padding: '10px 12px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '14px', background: '#21a038', color: '#fff', fontWeight: 600 }}
          >
            {isLoading ? 'Проверка...' : 'Продолжить'}
          </button>
        </form>
      </div>
    </div>
  );
});
