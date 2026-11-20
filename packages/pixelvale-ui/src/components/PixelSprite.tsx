import type { CSSProperties } from 'react';
import { cx } from '../lib/cx';

export type PixelSpriteName =
  | 'parsnip'
  | 'strawberry'
  | 'potato'
  | 'pumpkin'
  | 'wood'
  | 'stone'
  | 'gem'
  | 'fish'
  | 'watering-can'
  | 'sword'
  | 'coin'
  | 'apple';

interface SpriteDefinition {
  palette: Record<string, string>;
  rows: readonly string[];
}

/**
 * Original 12×12 pixel art. Sprites are stored as character grids so they stay
 * tiny in the bundle and can be recolored by editing the palette.
 */
const SPRITES: Record<PixelSpriteName, SpriteDefinition> = {
  parsnip: {
    palette: { G: '#4f8f3a', g: '#35682a', C: '#f3dfa2', c: '#c9a86a', w: '#fff6d6' },
    rows: [
      '............',
      '.....GG.....',
      '....GgGG....',
      '.....Gg.....',
      '....CwC.....',
      '...CwCCC....',
      '...CCCCC....',
      '...CCCCc....',
      '....CCCc....',
      '....CCc.....',
      '.....Cc.....',
      '............',
    ],
  },
  strawberry: {
    palette: {
      G: '#5aa33d',
      g: '#3a7328',
      R: '#e34b4b',
      r: '#a82f35',
      W: '#ffe9a8',
      w: '#f7d06b',
    },
    rows: [
      '............',
      '....gGgg....',
      '...GGGGGg...',
      '..rRRRRRr...',
      '..RWRRRWRr..',
      '..RRRRRRRr..',
      '..RwRwRRRr..',
      '..RRRRRRRr..',
      '...RRRRRr...',
      '....RRRr....',
      '.....Rr.....',
      '............',
    ],
  },
  potato: {
    palette: { B: '#d2a568', b: '#9a6b3f', d: '#6f4929' },
    rows: [
      '............',
      '...bbbb.....',
      '..bBBBBb....',
      '.bBBBBBBb...',
      '.bBBBBBBbb..',
      '.bBBBBBBBBb.',
      '.bBBdBBBBBb.',
      '..bBBBBBBb..',
      '...bBBBBb...',
      '....bbbb....',
      '............',
      '............',
    ],
  },
  pumpkin: {
    palette: { O: '#e8892b', o: '#b4611c', G: '#4c8a34', g: '#35682a' },
    rows: [
      '............',
      '.....gg.....',
      '....gGGg....',
      '..oOOOOOOo..',
      '.oOoOOOOoOo.',
      '.oOOOOOOOOo.',
      '.oOOoOOoOOo.',
      '.oOOOOOOOOo.',
      '..oOOOOOOo..',
      '...oOOOOo...',
      '....oooo....',
      '............',
    ],
  },
  wood: {
    palette: { H: '#8b5a2b', h: '#b07a42' },
    rows: [
      '............',
      '..HHHHHHH...',
      '..HhhhhhHH..',
      '..HHHHHHH...',
      '..hhhhhhH...',
      '..HHHHHHH...',
      '..hhhhhhH...',
      '..HHHHHHH...',
      '..hhhhhhH...',
      '............',
      '............',
      '............',
    ],
  },
  stone: {
    palette: { S: '#aeb8c2', s: '#7c8794' },
    rows: [
      '............',
      '....ssss....',
      '..ssSSSSss..',
      '.ssSSSSSSss.',
      '.sSSSSSSSSs.',
      '.sSSSSSSSSs.',
      '..ssSSSSss..',
      '....ssss....',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  gem: {
    palette: { C: '#5cc9e8', c: '#2f8fae', W: '#e6fbff' },
    rows: [
      '............',
      '....CCCC....',
      '...CWWCCC...',
      '..CWCCCCCC..',
      '..CCCCCCCC..',
      '..cCCCCCCc..',
      '...cCCCCc...',
      '....cCCc....',
      '.....cc.....',
      '............',
      '............',
      '............',
    ],
  },
  fish: {
    palette: { B: '#5aa7d6', b: '#2f6f9e', d: '#173b52' },
    rows: [
      '............',
      '............',
      '.....BBBB...',
      '...BBBBBBB..',
      '..BBdBBBBBB.',
      '.BBBBBBBBBBb',
      '.BbBBBBBBBBb',
      '..BBBBBBBBb.',
      '...bbbbbbb..',
      '............',
      '............',
      '............',
    ],
  },
  'watering-can': {
    palette: { H: '#7aa8c9', h: '#4c7b9b' },
    rows: [
      '............',
      '...HHHH.....',
      '..HHHHHH..H.',
      '..HHHHHHHHH.',
      '..HhhhhhHH..',
      '..HhhhhhH...',
      '...HHHHH....',
      '....HHHH....',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  sword: {
    palette: { W: '#e8f4ff', s: '#9fb4c7', H: '#c58a3c', S: '#7a4a22' },
    rows: [
      '.......WW...',
      '......WWs...',
      '.....WWs....',
      '....WWs.....',
      '...WWs......',
      '..WWs.......',
      '.HWWS.......',
      '.HH.........',
      'HHH.........',
      '.H..........',
      '............',
      '............',
    ],
  },
  coin: {
    palette: { G: '#b9821f', Y: '#f2c14e', W: '#ffe59a', y: '#d9a12e' },
    rows: [
      '............',
      '....GGGG....',
      '..GGYYYYGG..',
      '.GYYWWWWYYG.',
      '.GYWyyyyWYG.',
      'GYWyyyyyyWYG',
      'GYWyyyyyyWYG',
      '.GYWyyyyWYG.',
      '.GYYWWWWYYG.',
      '..GGYYYYGG..',
      '....GGGG....',
      '............',
    ],
  },
  apple: {
    palette: { R: '#dd4b3e', r: '#a32f27', W: '#ffd9a0', G: '#5aa33d', g: '#3a7328' },
    rows: [
      '............',
      '......g.....',
      '.....gGg....',
      '..rRRRRRr...',
      '.rRRRRRRRr..',
      '.RRRWRRRRRr.',
      '.RRRRRRRRRr.',
      '.rRRRRRRRr..',
      '..rRRRRRr...',
      '...rrrrr....',
      '............',
      '............',
    ],
  },
};

interface SpriteRect {
  x: number;
  y: number;
  width: number;
  fill: string;
}

const rectCache = new Map<PixelSpriteName, readonly SpriteRect[]>();

function getRects(name: PixelSpriteName): readonly SpriteRect[] {
  const cached = rectCache.get(name);
  if (cached) return cached;

  const definition = SPRITES[name];
  const rects: SpriteRect[] = [];

  definition.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      if (!key || key === '.') {
        x += 1;
        continue;
      }

      const fill = definition.palette[key];
      let width = 1;
      while (row[x + width] === key) width += 1;

      if (fill) rects.push({ x, y, width, fill });
      x += width;
    }
  });

  rectCache.set(name, rects);
  return rects;
}

export interface PixelSpriteProps {
  name: PixelSpriteName;
  /** Rendered square size in CSS pixels. The art itself is a 12×12 grid. */
  size?: number;
  /** Accessible name. Omit for purely decorative sprites. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function PixelSprite({
  name,
  size = 40,
  label,
  className,
  style,
}: PixelSpriteProps) {
  return (
    <svg
      className={cx('pv-sprite', className)}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={style}
    >
      {label ? <title>{label}</title> : null}
      {getRects(name).map((rect) => (
        <rect
          key={`${rect.x}-${rect.y}-${rect.width}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={1}
          fill={rect.fill}
        />
      ))}
    </svg>
  );
}
