import * as React from 'react';
import { Button as IslandButton, Card as IslandCard } from 'animal-island-ui';

// animal-island-ui 的 props 在不同版本略有差异，这里做适配层：
// - 变体用 `type`（default | primary，另支持 ghost 布尔）；
// - HTML 按钮类型必须走 `htmlType`（库默认 "button"，表单里要显式传 "submit"）；
// - 组件以 any 透传，避免 props 类型收紧导致构建失败。
const AnyButton = IslandButton as unknown as React.ComponentType<Record<string, unknown>>;
const AnyCard = IslandCard as unknown as React.ComponentType<Record<string, unknown>>;

type BtnProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  /** 外观变体：primary 主按钮，ghost 幽灵按钮，其余按 default */
  islandType?: 'primary' | 'default' | 'secondary' | 'ghost';
  /** HTML 按钮类型：表单提交必须传 "submit"（库默认 button 不会触发提交） */
  htmlType?: 'submit' | 'button' | 'reset';
  loading?: boolean;
  danger?: boolean;
  block?: boolean;
};

export function IButton({
  islandType = 'default',
  loading,
  htmlType = 'button',
  children,
  disabled,
  style,
  danger,
  block,
  ...rest
}: BtnProps): JSX.Element {
  const variant = islandType === 'primary' ? 'primary' : 'default';
  return (
    <AnyButton
      type={variant}
      ghost={islandType === 'ghost'}
      htmlType={htmlType}
      danger={danger}
      block={block}
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
  // app-pink 是库内置的粉色卡片色，贴合少女心主题
  return (
    <AnyCard style={style} color="app-pink">
      {children}
    </AnyCard>
  );
}
