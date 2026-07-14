import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface PaymentMethodsContextValue {
  vnpayEnabled: boolean;
}

const PaymentMethodsContext = createContext<PaymentMethodsContextValue>({
  vnpayEnabled: false,
});

export function PaymentMethodsProvider({ children }: { children: ReactNode }) {
  const [vnpayEnabled, setVnpayEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    void axios
      .get<{ methods: { vnpay: boolean } }>(`${API_URL}/payment/methods`)
      .then((response) => {
        if (mounted) setVnpayEnabled(response.data.methods.vnpay === true);
      })
      .catch(() => {
        // Fail closed: mock payment remains available when capability discovery fails.
        if (mounted) setVnpayEnabled(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <PaymentMethodsContext.Provider value={{ vnpayEnabled }}>
      {children}
    </PaymentMethodsContext.Provider>
  );
}

// Kept beside the provider so consumers cannot import a mismatched context.
// eslint-disable-next-line react-refresh/only-export-components
export function usePaymentMethods(): PaymentMethodsContextValue {
  return useContext(PaymentMethodsContext);
}
