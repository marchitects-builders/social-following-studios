/**
 * Vehicle class illustrations.
 *
 * Drawn to catalog standard rather than icon standard: correct class proportions,
 * a lit body with a specular sweep along the shoulder line, glass that darkens
 * toward the roof, multi spoke alloys, and a contact shadow. Each class reads as a
 * different car at a glance, which is the job the fleet grid needs done.
 *
 * These carry the page until photography arrives. Drop a file at the class photo
 * path in lib/business.ts and the card switches to the photograph.
 */

type Shape = 'compact' | 'midsize' | 'fullsize' | 'suv'

type Spec = {
  body: string
  glass: string[]
  shoulder: string
  wheels: [number, number, number][]
  shadow: { cx: number; rx: number }
}

const SHAPES: Record<Shape, Spec> = {
  compact: {
    body:
      'M92 150 L92 122 C92 110 99 103 112 100 L168 88 C182 62 206 51 240 51 L296 51 C325 51 341 63 355 86 L404 96 C417 99 424 107 424 119 L424 150 L388 150 A26 26 0 0 0 336 150 L206 150 A26 26 0 0 0 154 150 Z',
    glass: [
      'M180 87 C191 66 210 57 238 57 L246 57 L246 84 Z',
      'M254 57 L294 57 C316 57 329 67 340 84 L254 84 Z',
    ],
    shoulder: 'M96 118 L170 104 L360 104 L420 116',
    wheels: [
      [180, 150, 26],
      [362, 150, 26],
    ],
    shadow: { cx: 258, rx: 176 },
  },
  midsize: {
    body:
      'M70 150 L70 121 C70 109 77 102 90 99 L156 86 C170 59 195 48 232 48 L306 48 C338 48 355 61 369 85 L422 95 C435 98 442 106 442 118 L442 150 L404 150 A27 27 0 0 0 350 150 L186 150 A27 27 0 0 0 132 150 Z',
    glass: [
      'M168 85 C179 63 200 54 230 54 L238 54 L238 82 Z',
      'M246 54 L304 54 C328 54 342 64 354 82 L246 82 Z',
    ],
    shoulder: 'M74 117 L158 102 L374 102 L438 115',
    wheels: [
      [159, 150, 27],
      [377, 150, 27],
    ],
    shadow: { cx: 256, rx: 192 },
  },
  fullsize: {
    body:
      'M54 151 L54 122 C54 110 61 103 74 100 L150 86 C164 59 191 48 231 48 L318 48 C352 48 369 61 383 85 L438 95 C452 98 459 106 459 118 L459 151 L420 151 A27 27 0 0 0 366 151 L172 151 A27 27 0 0 0 118 151 Z',
    glass: [
      'M162 85 C173 63 196 54 229 54 L237 54 L237 82 Z',
      'M245 54 L316 54 C340 54 354 64 366 82 L245 82 Z',
    ],
    shoulder: 'M58 118 L152 102 L388 102 L455 115',
    wheels: [
      [145, 151, 27],
      [393, 151, 27],
    ],
    shadow: { cx: 256, rx: 206 },
  },
  suv: {
    body:
      'M58 148 L58 104 C58 91 65 84 78 80 L116 68 C128 42 146 32 176 32 L330 32 C358 32 373 43 385 64 L436 80 C450 84 457 92 457 104 L457 148 L416 148 A31 31 0 0 0 354 148 L182 148 A31 31 0 0 0 120 148 Z',
    glass: [
      'M126 66 C136 47 150 39 174 39 L192 39 L192 64 Z',
      'M200 39 L302 39 L302 64 L200 64 Z',
      'M310 39 L326 39 C348 39 360 47 370 64 L310 64 Z',
    ],
    shoulder: 'M62 100 L120 84 L390 84 L453 100',
    wheels: [
      [151, 148, 31],
      [385, 148, 31],
    ],
    shadow: { cx: 258, rx: 200 },
  },
}

function Wheel({
  cx,
  cy,
  r,
  gradId,
}: {
  cx: number
  cy: number
  r: number
  gradId: string
}) {
  const spokes = Array.from({ length: 8 }, (_, i) => (i * 360) / 8)
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#12161c" />
      <circle cx={cx} cy={cy} r={r * 0.72} fill={`url(#${gradId})`} />
      {spokes.map((angle) => (
        <rect
          key={angle}
          x={cx - r * 0.055}
          y={cy - r * 0.66}
          width={r * 0.11}
          height={r * 0.52}
          rx={r * 0.055}
          fill="#f3f6f9"
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.19} fill="#e2e8f0" />
      <circle cx={cx} cy={cy} r={r * 0.09} fill="#9aa8b8" />
    </g>
  )
}

export function VehicleArt({ shape, className = '' }: { shape: Shape; className?: string }) {
  const car = SHAPES[shape]
  const id = shape

  return (
    /* Cropped to the drawn extents so the vehicle fills its card rather than
       floating inside empty margin. */
    <svg viewBox="42 22 432 166" className={className} role="presentation" aria-hidden="true">
      <defs>
        <linearGradient id={`paint-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b5f8a" />
          <stop offset="0.42" stopColor="#1e3d64" />
          <stop offset="1" stopColor="#0e2440" />
        </linearGradient>
        <linearGradient id={`glass-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f2033" stopOpacity="0.92" />
          <stop offset="1" stopColor="#6d8cae" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={`rim-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8eef4" />
          <stop offset="1" stopColor="#9fb0c2" />
        </linearGradient>
        <radialGradient id={`shade-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#0a1a2c" stopOpacity="0.3" />
          <stop offset="1" stopColor="#0a1a2c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx={car.shadow.cx} cy={176} rx={car.shadow.rx} ry={11} fill={`url(#shade-${id})`} />

      <path d={car.body} fill={`url(#paint-${id})`} />

      {car.glass.map((d, i) => (
        <path key={i} d={d} fill={`url(#glass-${id})`} />
      ))}

      {/* Specular sweep along the shoulder line */}
      <path
        d={car.shoulder}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.24"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {car.wheels.map(([cx, cy, r], i) => (
        <Wheel key={i} cx={cx} cy={cy} r={r} gradId={`rim-${id}`} />
      ))}
    </svg>
  )
}

export type { Shape }
