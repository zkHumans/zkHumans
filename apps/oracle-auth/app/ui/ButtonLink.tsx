import { Link } from '@remix-run/react';

interface ButtonLinkProps {
  to: string;
  children: React.ReactNode;
}

export function ButtonLink({ to, children }: ButtonLinkProps) {
  return (
    <Link
      to={to}
      className="rounded border border-blue-700 bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
    >
      {children}
    </Link>
  );
}
