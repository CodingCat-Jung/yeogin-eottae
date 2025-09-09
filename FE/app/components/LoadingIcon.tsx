import { forwardRef } from "react";

const LoadingIcon = forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg ref={ref} {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
    <path
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4l5-5-5-5v4a10 10 0 00-10 10h4z"
      className="opacity-75"
    />
  </svg>
));

export default LoadingIcon;
