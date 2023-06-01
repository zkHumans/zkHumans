import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import * as React from 'react';

interface AlertProps {
  type: 'info' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
}

const icon = (type: AlertProps['type']) => {
  switch (type) {
    case 'info':
      return InformationCircleIcon;
    case 'success':
      return CheckCircleIcon;
    case 'warning':
      return ExclamationTriangleIcon;
    case 'error':
      return XCircleIcon;
  }
};

export function Alert({ type, children }: AlertProps) {
  const Icon = icon(type);

  // use full CSS class names
  // https://v2.tailwindcss.com/docs/just-in-time-mode#arbitrary-value-support
  const classMap = {
    info: 'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-error',
  };

  return (
    <div className={`alert shadow-lg ${classMap[type]}`}>
      <div>
        <Icon className="h-6 w-6" strokeWidth="2" />
        <div>{children}</div>
      </div>
    </div>
  );
}
