import React from 'react';
import { observer } from 'mobx-react-lite';
import { sberAuthStore, SberLoginStep } from './sber_auth_store';

export const SberLoginDialog = observer(() => {
  const {
    step,
    loginMode,
    cookieInput,
    loginInput,
    passwordInput,
    smsInput,
    isLoading,
    error,
    smsTimeout,
  } = sberAuthStore;

  if (step === SberLoginStep.SUCCESS) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--success-color)' }}>
            ✓ Успешно!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
            Вы успешно подключили СберБанк Онлайн. Счета и балансы загружены.
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

  if (step === SberLoginStep.SMS) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0 }}>Подтверждение СМС</h3>
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

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            СберБанк отправил официальное СМС с кодом подтверждения на ваш привязанный номер телефона.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sberAuthStore.submit();
            }}
          >
            <div className="form-group">
              <label className="form-label">Код из СМС</label>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                placeholder="Цифры из СМС"
                value={smsInput}
                disabled={isLoading}
                onChange={(e) => sberAuthStore.setSmsInput(e.target.value)}
                required
                autoFocus
              />
            </div>

            {smsTimeout && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                Время действия кода: <strong>{smsTimeout} сек.</strong>
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
              style={{ width: '100%', marginTop: '16px', background: '#21a038', color: '#fff', fontWeight: 600 }}
            >
              {isLoading ? 'Проверка...' : 'Подтвердить вход'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>Вход в СберБанк Онлайн</h3>
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

        {/* Tab switchers */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '4px',
            borderRadius: '8px',
            marginBottom: '18px',
          }}
        >
          <button
            type="button"
            onClick={() => sberAuthStore.setLoginMode('cookie')}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              background: loginMode === 'cookie' ? 'var(--card-bg)' : 'transparent',
              color: loginMode === 'cookie' ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            По Cookie / Токену
          </button>
          <button
            type="button"
            onClick={() => sberAuthStore.setLoginMode('srp')}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              background: loginMode === 'srp' ? 'var(--card-bg)' : 'transparent',
              color: loginMode === 'srp' ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            Логин и Пароль
          </button>
        </div>

        {loginMode === 'cookie' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sberAuthStore.submit();
            }}
          >
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
              Войдите в СберБанк Онлайн в браузере (на <code>online.sberbank.ru</code>), откройте DevTools (F12) → Сеть
              или Application → Cookies и скопируйте <code>UFS-SESSION</code> и <code>UFS-TOKEN</code> (или всю строку Cookie).
            </p>

            <div className="form-group">
              <label className="form-label">Строка Cookie или токены</label>
              <textarea
                className="form-input"
                style={{ height: '90px', resize: 'vertical', fontSize: '12px', fontFamily: 'monospace' }}
                placeholder="UFS-SESSION=...; UFS-TOKEN=..."
                value={cookieInput}
                disabled={isLoading}
                onChange={(e) => sberAuthStore.setCookieInput(e.target.value)}
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
              style={{ width: '100%', marginTop: '16px', background: '#21a038', color: '#fff', fontWeight: 600 }}
            >
              {isLoading ? 'Проверка сессии...' : 'Войти по токену'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sberAuthStore.submit();
            }}
          >
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
              Вход через веб-клиент СберБанка по протоколу SRP-512. Банк проверит данные и отправит официальное СМС на
              ваш телефон.
            </p>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Логин (телефон или номер карты)</label>
              <input
                className="form-input"
                type="text"
                placeholder="+7 999 123-45-67 или логин"
                value={loginInput}
                disabled={isLoading}
                onChange={(e) => sberAuthStore.setLoginInput(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Пароль</label>
              <input
                className="form-input"
                type="password"
                placeholder="Пароль от СберБанк Онлайн"
                value={passwordInput}
                disabled={isLoading}
                onChange={(e) => sberAuthStore.setPasswordInput(e.target.value)}
                required
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
              style={{ width: '100%', marginTop: '16px', background: '#21a038', color: '#fff', fontWeight: 600 }}
            >
              {isLoading ? 'Запрос СМС...' : 'Получить СМС-код'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
});
