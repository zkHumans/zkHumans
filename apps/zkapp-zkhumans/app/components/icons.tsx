import { CheckCircleIcon } from '@heroicons/react/24/outline';

export function IconNotPending() {
  return (
    <span className="tooltip" data-tip="confirmed">
      <CheckCircleIcon className="h-6 w-6" strokeWidth="1" />
    </span>
  );
}

export function IconPending() {
  return (
    <span className="tooltip" data-tip="pending">
      <span className="loading loading-ring loading-sm" />
    </span>
  );
}
