
import React from 'react';

const Spinner = ({ className }: { className?: string }) => {
  return (
    <div
      className={`w-12 h-12 border-4 border-solid border-blue-600 border-t-transparent rounded-full animate-spin ${className || ''}`}
      role="status"
    >
        <span className="sr-only">Loading...</span>
    </div>
  );
};

export default Spinner;
