import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useControllableState } from '../lib/useControllableState';
import { useLocale, useSound } from './PixelValeProvider';
import { PixelIcon } from './PixelIcon';

export interface TreeNode {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  children?: readonly TreeNode[];
}

export interface TreeViewProps extends Omit<
  HTMLAttributes<HTMLUListElement>,
  'onSelect'
> {
  nodes: readonly TreeNode[];
  label?: string;
  expanded?: readonly string[];
  defaultExpanded?: readonly string[];
  onExpandedChange?: (expanded: string[]) => void;
  selected?: string;
  defaultSelected?: string;
  onSelectedChange?: (id: string) => void;
  disabled?: boolean;
}

interface FlatNode {
  node: TreeNode;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
  expanded: boolean;
}

function flattenNodes(
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
  parentId: string | null = null,
  output: FlatNode[] = [],
): FlatNode[] {
  for (const node of nodes) {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = hasChildren && expanded.has(node.id);
    output.push({ node, depth, parentId, hasChildren, expanded: isExpanded });
    if (isExpanded && node.children) {
      flattenNodes(node.children, expanded, depth + 1, node.id, output);
    }
  }
  return output;
}

/**
 * Single-select tree with roving tabindex and the expected Arrow/Home/End
 * behavior. Children render in nested groups; disabled nodes cannot be
 * selected, and collapsing a focused branch moves focus to its parent.
 */
export function TreeView({
  nodes,
  label,
  expanded: controlledExpanded,
  defaultExpanded = [],
  onExpandedChange,
  selected: controlledSelected,
  defaultSelected,
  onSelectedChange,
  disabled = false,
  className,
  ...rest
}: TreeViewProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const shouldFocusRef = useRef(false);
  const { t } = useLocale();
  const { play } = useSound();

  const [expanded, setExpanded] = useControllableState<string[]>({
    value: controlledExpanded === undefined ? undefined : [...controlledExpanded],
    defaultValue: [...defaultExpanded],
    onChange: onExpandedChange,
  });
  const [selected, setSelected] = useControllableState<string>({
    value: controlledSelected,
    defaultValue: defaultSelected ?? '',
    onChange: onSelectedChange,
  });
  const [focusId, setFocusId] = useState<string | null>(null);

  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const visible = useMemo(() => flattenNodes(nodes, expandedSet), [nodes, expandedSet]);
  const visibleIds = visible.map((entry) => entry.node.id);
  const tabbableId = visibleIds.includes(focusId ?? '')
    ? (focusId as string)
    : visibleIds.includes(selected)
      ? selected
      : (visibleIds[0] ?? '');

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    itemRefs.current.get(focusId ?? '')?.focus();
    shouldFocusRef.current = false;
  }, [focusId, expanded]);

  useEffect(() => {
    if (!focusId || visibleIds.includes(focusId)) return;
    const fallback = visibleIds.includes(selected) ? selected : (visibleIds[0] ?? null);
    shouldFocusRef.current = true;
    setFocusId(fallback);
  }, [visibleIds, focusId, selected]);

  const focusNode = (id: string) => {
    if (id === focusId) return;
    shouldFocusRef.current = true;
    setFocusId(id);
  };

  const toggleNode = (id: string, nodeDisabled = false) => {
    if (disabled || nodeDisabled) return;
    const next = expandedSet.has(id)
      ? expanded.filter((candidate) => candidate !== id)
      : [...expanded, id];
    setExpanded(next);
    play('toggle');
  };

  const selectNode = (node: TreeNode) => {
    if (disabled || node.disabled) return;
    setSelected(node.id);
    play('click');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>, entry: FlatNode) => {
    if (disabled || event.target !== event.currentTarget) return;
    if (
      ![
        'ArrowDown',
        'ArrowUp',
        'Home',
        'End',
        'ArrowRight',
        'ArrowLeft',
        'Enter',
        ' ',
      ].includes(event.key)
    ) {
      return;
    }
    event.stopPropagation();
    const index = visibleIds.indexOf(entry.node.id);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (index < visible.length - 1) focusNode(visible[index + 1].node.id);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (index > 0) focusNode(visible[index - 1].node.id);
        break;
      case 'Home':
        event.preventDefault();
        if (visible[0]) focusNode(visible[0].node.id);
        break;
      case 'End':
        event.preventDefault();
        if (visible[visible.length - 1]) {
          focusNode(visible[visible.length - 1].node.id);
        }
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (entry.hasChildren && !entry.expanded) {
          toggleNode(entry.node.id, entry.node.disabled);
        } else if (entry.hasChildren && index < visible.length - 1) {
          focusNode(visible[index + 1].node.id);
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (entry.hasChildren && entry.expanded) {
          toggleNode(entry.node.id, entry.node.disabled);
        } else if (entry.parentId) {
          focusNode(entry.parentId);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectNode(entry.node);
        break;
      default:
        break;
    }
  };

  const renderNodes = (
    level: readonly TreeNode[],
    depth: number,
    parentId: string | null,
  ): ReactNode =>
    level.map((node) => {
      const children = node.children ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = hasChildren && expandedSet.has(node.id);
      const isSelected = selected === node.id;
      const isTabbable = tabbableId === node.id;
      const entry: FlatNode = {
        node,
        depth,
        parentId,
        hasChildren,
        expanded: isExpanded,
      };

      return (
        <li
          key={node.id}
          ref={(element) => {
            if (element) itemRefs.current.set(node.id, element);
            else itemRefs.current.delete(node.id);
          }}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isSelected}
          aria-disabled={disabled || node.disabled || undefined}
          tabIndex={isTabbable ? 0 : -1}
          className="pv-tree__item"
          style={{ '--pv-tree-indent': `${depth * 16}px` } as CSSProperties}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocusId(node.id);
          }}
          onKeyDown={(event) => handleKeyDown(event, entry)}
        >
          <span
            className="pv-tree__row"
            onMouseDown={(event) => {
              event.preventDefault();
              itemRefs.current.get(node.id)?.focus();
            }}
            onClick={() => selectNode(node)}
          >
            <span
              className={cx(
                'pv-tree__chevron',
                !hasChildren && 'pv-tree__chevron--empty',
              )}
              aria-hidden="true"
              onClick={(event) => {
                event.stopPropagation();
                if (hasChildren) toggleNode(node.id, node.disabled);
              }}
            >
              {hasChildren ? (
                <PixelIcon
                  name={isExpanded ? 'chevron-down' : 'chevron-right'}
                  size={13}
                />
              ) : null}
            </span>
            {node.icon ? (
              <span className="pv-tree__icon" aria-hidden="true">
                {node.icon}
              </span>
            ) : null}
            <span className="pv-tree__label">{node.label}</span>
          </span>

          {isExpanded ? (
            <ul role="group" className="pv-tree__group">
              {renderNodes(children, depth + 1, node.id)}
            </ul>
          ) : null}
        </li>
      );
    });

  return (
    <ul
      role="tree"
      className={cx('pv-tree', disabled && 'pv-tree--disabled', className)}
      aria-label={label ?? t('tree')}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      {renderNodes(nodes, 0, null)}
    </ul>
  );
}
