import * as React from 'react';
import { Button as IslandButton, Card as IslandCard } from 'animal-island-ui';

// animal-island-ui 的 props 在不同版本略有差异，这里用 any 透传，
// 既享受到可爱岛屿风格，又避免因 props 类型收紧导致构建失败。
const AnyButton = IslandButton as unknown as React.ComponentType<Record<string, unknown>>;
const AnyCard = IslandCard as unknown as React.ComponentType<Record<string, unknown>>;

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  islandType?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
};

export function IButton({ islandType = 'secondary', loading, children, disabled, style, ...rest }: BtnProps): JSX.Element {
  return (
    <AnyButton
      type={islandType === 'primary' ? 'primary' : islandType === 'ghost' ? 'ghost' : 'secondary'}
      loading={loading}
      disabled={disabled || loading}
      style={style}
      {...(rest as Record<string, unknown>)}
    >
      {children as React.ReactNode}
    </AnyButton>
  );
}

export function ICard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <AnyCard style={style} color="app-cream">
      {children}
    </AnyCard>
  );
}
