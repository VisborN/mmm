import React from 'react';
import { observer } from 'mobx-react-lite';
import { authStore, LoginStep } from './auth_store';

export const TinkoffLoginDialog = observer(() => {
  const { step, inputValue, isLoading, error, maskedPhone, otpLength, userName } = authStore;

  if (step === LoginStep.SUCCESS) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--success-color)' }}>
            ✓ Успешно!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
            Вы успешно вошли в аккаунт Т-Банка.
          </p>
          <button
            onClick={() => authStore.reset()}
            className="btn btn-primary"
            style={{ width: '100%', background: '#ffdd2d', color: '#333', fontWeight: 600 }}
          >
            Готово
          </button>
        </div>
      </div>
    );
  }

  const getConfig = () => {
    switch (step) {
      case LoginStep.PHONE:
        return {
          title: 'Вход в Т-Банк',
          label: 'Номер телефона',
          placeholder: '+7 999 123-45-67',
          type: 'tel',
          inputMode: 'tel' as const,
        };
      case LoginStep.TOTP:
        return {
          title: 'Код подтверждения',
          label: '6-значный код из приложения Т-Банка или Authenticator',
          placeholder: '6 цифр',
          type: 'text',
          inputMode: 'numeric' as const,
        };
      case LoginStep.OTP:
        return {
          title: 'Подтверждение СМС',
          label: maskedPhone ? `Код из СМС (отправлен на ${maskedPhone})` : 'Код из СМС',
          placeholder: `${otpLength || 6} цифр`,
          type: 'text',
          inputMode: 'numeric' as const,
        };
      case LoginStep.PASSWORD:
        return {
          title: 'Пароль Т-Банка',
          label: userName ? `Здравствуйте, ${userName}! Введите пароль` : 'Пароль от личного кабинета',
          placeholder: 'Введите пароль',
          type: 'password',
          inputMode: 'text' as const,
        };
      default:
        return {
          title: 'Вход в Т-Банк',
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
    authStore.submit();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>{config.title}</h3>
          <button
            onClick={() => authStore.reset()}
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
              onChange={(e) => authStore.setInputValue(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && (
            <div className="error-banner" style={{ margin: '14px 0', padding: '10px 12px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px', background: '#ffdd2d', color: '#333', fontWeight: 600 }}
          >
            {isLoading ? 'Проверка...' : 'Продолжить'}
          </button>

          {step === LoginStep.TOTP && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => authStore.fallbackToSms()}
              className="btn"
              style={{
                width: '100%',
                marginTop: '8px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                fontSize: '13px',
              }}
            >
              Войти по СМС
            </button>
          )}
        </form>
      </div>
    </div>
  );
});