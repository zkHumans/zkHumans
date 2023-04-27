import * as React from 'react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
}

export default function Modal({ title, children }: ModalProps) {
  const id = React.useId();
  return (
    <>
      <input
        id={id}
        type="checkbox"
        className="modal-toggle"
        // open the modal by default
        defaultChecked={true}
      />
      <label htmlFor={id} className="modal cursor-pointer">
        <label className="modal-box relative" htmlFor="">
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="py-4">{children}</p>
        </label>
      </label>
    </>
  );
}
