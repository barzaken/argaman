"use client";

import type { SVGProps } from "react";

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height={48}
      width={40}
      viewBox="0 0 150 65"
      {...props}
    >
      <style type="text/css">
        {".cls-0 {fill:#07070B;}\n.cls-1 {fill:url(#SVGID_1_);}"}
      </style>
      <path
        className="cls-0"
        d="m122.9 29.5v8.5h15.7v12c-3.6 1.5-7.8 4.6-14.9 4.6-12.8 0.2-20.6-9.6-20.6-21.8 0-7.8 4.8-22.6 20.3-22.8 6.1 0 10.5 1.8 16.3 7.5l6.2-8.1c-4.8-4.3-11.3-8.7-20.9-8.7-1.1 0-2.1-0.1-3.3 0-5.8 0.4-13.7 2.3-19.3 7.9-0.7 0.7-1.3 1.3-2.3 2.9 1.1 2.5 1.6 5.6 1.6 8.4-0.1 7.5-2.7 13.8-8.4 18.5 1.4 9.8 8.5 21.3 20.9 23.9 6 1.6 11.9 1.8 18.5 0.4 5-1.1 10.4-3.7 14.8-8.8l0.1-24.4h-24.7z"
      />
      <path
        className="cls-0"
        d="m84 38.7c8.4-2.1 13.8-8.2 13.9-17.3 0.1-9.8-5.8-19.8-21.1-19.8l-26.2-0.1 0.1 24.5 0.9 2h9.1v-17.3h14.9c5 0 8.3 1.5 10 3.8 1.2 1.7 2 3.5 1.9 6.6-0.2 5.8-4.5 10.7-12.3 10.7h-22.1l7.7 17.8-0.1-9.5h12.9l14 22.6 11.5-0.1-15.1-23.9z"
      />
      <path
        className="cls-0"
        d="m36.6 1.1h-9.8l-24.3 61.5h9l6.1-15.4h19.6l5.6-6.8 0.6 0.1-1-1.6h-21.1l10.4-25.5 1.6-3.3z"
      />
      <linearGradient
        id="SVGID_1_"
        x1={43.23}
        x2={46.81}
        y1={41.74}
        y2={15.06}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#170A0D" offset={0} />
        <stop stopColor="#CD2027" offset={1} />
      </linearGradient>
      <path
        className="cls-1"
        d="m26.8 1.1 25.2 61.5 10.1-0.1-0.1-0.6-25.4-60.8z"
      />
    </svg>
  );
}
