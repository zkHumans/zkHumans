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

  return (
    <div className={`alert alert-${type} shadow-lg`}>
      <div>
        <Icon className="h-6 w-6" strokeWidth="2" />
        <div>{children}</div>
      </div>
    </div>
  );
}
