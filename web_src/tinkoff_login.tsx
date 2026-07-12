import React from 'react';
import { observer } from 'mobx-react-lite';
import { authStore, LoginStep } from './auth_store';

export const TinkoffLoginDialog = observer(() => {
  const { step, inputValue, isLoading, error } = authStore;

  if (step === LoginStep.SUCCESS) {
    return (
      <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', padding: '40px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', color: 'var(--success-color)' }}>Success!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>You are now logged in.</p>
            <button onClick={() => authStore.reset()} className="btn btn-primary" style={{ width: '100%' }}>
              Done
            </button>
          </div>
      </div>
    );
  }

  const config = {
    [LoginStep.IDLE]: { title: "Login", label: "Input", type: "text" },
    [LoginStep.PHONE]: { title: "Login", label: "Phone Number", type: "text" },
    [LoginStep.OTP]: { title: "Verification", label: "Enter SMS Code", type: "number" },
    [LoginStep.PASSWORD]: { title: "Identity", label: "Enter Password", type: "password" },
    [LoginStep.LOADING]: { title: "Wait", label: "Processing...", type: "text" },
    [LoginStep.SUCCESS]: { title: "success", label: "success", type: "text" },
  }[step];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    authStore.submit();
  };

  return (
    <div className="modal-overlay">
        <div className="modal-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ margin: 0 }}>{config.title}</h3>
            <button onClick={() => authStore.reset()} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '24px', cursor: 'pointer' }}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{config.label}</label>
              <input
                className="form-input"
                type={config.type}
                value={inputValue}
                disabled={isLoading}
                onChange={(e) => authStore.setInputValue(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && <div className="error-banner" style={{ margin: '16px 0', padding: '12px' }}>{error}</div>}

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '8px', background: '#f59e0b', color: '#fff' }}
            >
              {isLoading ? "Loading..." : "Submit"}
            </button>
          </form>
        </div>
    </div>
  );
});