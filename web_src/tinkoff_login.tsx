import React from 'react';
import { observer } from 'mobx-react-lite';
import { authStore, LoginStep } from './auth_store';


export const TinkoffLoginDialog = observer(() => {
  const { step, inputValue, isLoading, error } = authStore;

  // If login is successful, we can return null or a success message
  if (step === LoginStep.SUCCESS) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold">Success!</h2>
        <p>You are now logged in.</p>
        <button onClick={() => authStore.reset()} className="mt-4 btn-primary">
          Done
        </button>
      </div>
    );
  }

  // Determine UI labels based on current step (Declarative)
  const config = {
    [LoginStep.IDLE]: { title: "Login", label: "Input", type: "text" },
    [LoginStep.PHONE]: { title: "Login", label: "Phone Number", type: "text" },
    [LoginStep.OTP]: { title: "Verification", label: "Enter SMS Code", type: "number" },
    [LoginStep.PASSWORD]: { title: "Identity", label: "Enter Password", type: "password" },
    [LoginStep.LOADING]: { title: "Wait", label: "Processing...", type: "text" },
    [LoginStep.SUCCESS]: { title: "success", label: "success", type: "text" },
  }[step] ;

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    authStore.submit();
  };

  return (
    <div className="auth-modal shadow-lg rounded-xl p-6 bg-white w-80">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">{config.title}</h2>
        <button onClick={() => authStore.reset()} className="text-gray-400">×</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{config.label}</label>
          <input
            className="w-full border rounded-md p-2"
            type={config.type}
            value={inputValue}
            disabled={isLoading}
            onChange={(e) => authStore.setInputValue(e.target.value)}
            required
            autoFocus
          />
        </div>

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-3 rounded-md font-bold bg-[#ffdd2d] hover:bg-[#fcc521] transition-all ${
            isLoading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {isLoading ? "Loading..." : "Submit"}
        </button>
      </form>
    </div>
  );
});