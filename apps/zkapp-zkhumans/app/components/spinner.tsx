export function Spinner() {
  // TODO: use this rather than svg once daisyui+chrome+mac bug resoloved:
  // https://github.com/saadeghi/daisyui/issues/2193
  // return <span className="loading loading-ring loading-sm" />;

  // https://github.com/SamHerbert/SVG-Loaders/blob/master/svg-loaders/puff.svg?short_path=288de9e
  return (
    <span>
      <svg
        width="20"
        height="20"
        viewBox="0 0 44 44"
        xmlns="http://www.w3.org/2000/svg"
        stroke="currentColor"
      >
        <g fill="none" fill-rule="evenodd" stroke-width="2">
          <circle cx="22" cy="22" r="1">
            <animate
              attributeName="r"
              begin="0s"
              dur="1.8s"
              values="1; 20"
              calcMode="spline"
              keyTimes="0; 1"
              keySplines="0.165, 0.84, 0.44, 1"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-opacity"
              begin="0s"
              dur="1.8s"
              values="1; 0"
              calcMode="spline"
              keyTimes="0; 1"
              keySplines="0.3, 0.61, 0.355, 1"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="22" cy="22" r="1">
            <animate
              attributeName="r"
              begin="-0.9s"
              dur="1.8s"
              values="1; 20"
              calcMode="spline"
              keyTimes="0; 1"
              keySplines="0.165, 0.84, 0.44, 1"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-opacity"
              begin="-0.9s"
              dur="1.8s"
              values="1; 0"
              calcMode="spline"
              keyTimes="0; 1"
              keySplines="0.3, 0.61, 0.355, 1"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      </svg>
    </span>
  );
}
