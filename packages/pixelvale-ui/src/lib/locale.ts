export type PixelValeLocale = 'en' | 'zh-CN';

export interface LocaleMessages {
  closeDialog: string;
  dialogLabel: string;
  notifications: string;
  dismissNotification: string;
  dismissMessage: string;
  sections: string;
  progress: string;
  progressSteps: string;
  selectPlaceholder: string;
  chooseOption: string;
  options: string;
  noOptions: string;
  menuLabel: string;
  labelOptions: string;
  searchPlaceholder: string;
  searchOptions: string;
  noMatches: string;
  clearSelection: string;
  inventory: string;
  itemQuantity: string;
  edible: string;
  each: string;
  rarityCommon: string;
  rarityUncommon: string;
  rarityRare: string;
  rarityLegendary: string;
  decrease: string;
  increase: string;
  value: string;
  rating: string;
  star: string;
  stars: string;
  ratingSummary: string;
  ratingSummaryLabel: string;
  statusOnline: string;
  statusAway: string;
  statusBusy: string;
  statusOffline: string;
  dataSummary: string;
  dataSummaryLabel: string;
  noData: string;
  noDataLabel: string;
  gold: string;
  breadcrumb: string;
  pagination: string;
  previousPage: string;
  nextPage: string;
  pageNumber: string;
  timeline: string;
  addTag: string;
  tagsSelected: string;
  removeTag: string;
  tagLimit: string;
  calendar: string;
  today: string;
  previousMonth: string;
  nextMonth: string;
  table: string;
  tree: string;
  loading: string;
  selectDate: string;
  chooseDate: string;
  clearDate: string;
  carousel: string;
  slide: string;
  previousSlide: string;
  nextSlide: string;
  goToSlide: string;
  slideOf: string;
  dropFiles: string;
  browseFiles: string;
  selectedFiles: string;
  removeFile: string;
  filesSkipped: string;
  fileTooLarge: string;
  fileTypeRejected: string;
  tooManyFiles: string;
}

export type LocaleMessageKey = keyof LocaleMessages;
export type LocaleMessagesOverride = Partial<Record<LocaleMessageKey, string>>;

export type TranslateFunction = (
  key: LocaleMessageKey,
  params?: Record<string, string | number>,
) => string;

const EN: LocaleMessages = {
  closeDialog: 'Close dialog',
  dialogLabel: 'Dialog',
  notifications: 'Notifications',
  dismissNotification: 'Dismiss notification',
  dismissMessage: 'Dismiss message',
  sections: 'Sections',
  progress: 'Progress',
  progressSteps: 'Progress steps',
  selectPlaceholder: 'Choose…',
  chooseOption: 'Choose an option',
  options: 'Options',
  noOptions: 'No options available',
  menuLabel: '{label} menu',
  labelOptions: '{label} options',
  searchPlaceholder: 'Search…',
  searchOptions: 'Search options',
  noMatches: 'No matching options',
  clearSelection: 'Clear selection',
  inventory: 'Inventory',
  itemQuantity: '{name}, quantity {count}',
  edible: 'Edible',
  each: 'each',
  rarityCommon: 'Common',
  rarityUncommon: 'Uncommon',
  rarityRare: 'Rare',
  rarityLegendary: 'Legendary',
  decrease: 'Decrease {label}',
  increase: 'Increase {label}',
  value: 'value',
  rating: 'Rating',
  star: '{count} star',
  stars: '{count} stars',
  ratingSummary: '{value} out of {max} stars',
  ratingSummaryLabel: '{label}: {value} out of {max} stars',
  statusOnline: 'Online',
  statusAway: 'Away',
  statusBusy: 'Busy',
  statusOffline: 'Offline',
  dataSummary: '{count} points, last {last}',
  dataSummaryLabel: '{label}: {count} points, last {last}',
  noData: 'No data',
  noDataLabel: '{label}: no data',
  gold: 'gold',
  breadcrumb: 'Breadcrumb',
  pagination: 'Pagination',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  pageNumber: 'Page {page}',
  timeline: 'Timeline',
  addTag: 'Add a tag',
  tagsSelected: 'Selected tags',
  removeTag: 'Remove {tag}',
  tagLimit: 'Up to {count} tags',
  calendar: 'Calendar',
  today: 'Today',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  table: 'Data table',
  tree: 'Tree',
  loading: 'Loading',
  selectDate: 'Select a date',
  chooseDate: 'Choose a date',
  clearDate: 'Clear date',
  carousel: 'Carousel',
  slide: 'Slide',
  previousSlide: 'Previous slide',
  nextSlide: 'Next slide',
  goToSlide: 'Go to slide {index}',
  slideOf: 'Slide {index} of {total}',
  dropFiles: 'Drag files here, or browse',
  browseFiles: 'Browse files',
  selectedFiles: 'Selected files',
  removeFile: 'Remove {name}',
  filesSkipped: 'Some files were skipped.',
  fileTooLarge: '{name} is too large',
  fileTypeRejected: '{name} is not an accepted type',
  tooManyFiles: 'Up to {count} file(s)',
};

const ZH_CN: LocaleMessages = {
  closeDialog: '关闭对话框',
  dialogLabel: '对话框',
  notifications: '通知',
  dismissNotification: '关闭通知',
  dismissMessage: '关闭提示',
  sections: '分区',
  progress: '进度',
  progressSteps: '进度步骤',
  selectPlaceholder: '请选择…',
  chooseOption: '选择一个选项',
  options: '选项',
  noOptions: '暂无选项',
  menuLabel: '{label}菜单',
  labelOptions: '{label}选项',
  searchPlaceholder: '搜索…',
  searchOptions: '搜索选项',
  noMatches: '没有匹配的选项',
  clearSelection: '清除选择',
  inventory: '背包',
  itemQuantity: '{name}，数量 {count}',
  edible: '可食用',
  each: '每个',
  rarityCommon: '普通',
  rarityUncommon: '罕见',
  rarityRare: '稀有',
  rarityLegendary: '传说',
  decrease: '减少{label}',
  increase: '增加{label}',
  value: '数值',
  rating: '评分',
  star: '{count} 星',
  stars: '{count} 星',
  ratingSummary: '{value}/{max} 星',
  ratingSummaryLabel: '{label}：{value}/{max} 星',
  statusOnline: '在线',
  statusAway: '离开',
  statusBusy: '忙碌',
  statusOffline: '离线',
  dataSummary: '{count} 个数据点，最新 {last}',
  dataSummaryLabel: '{label}：{count} 个数据点，最新 {last}',
  noData: '暂无数据',
  noDataLabel: '{label}：暂无数据',
  gold: '金币',
  breadcrumb: '面包屑导航',
  pagination: '分页导航',
  previousPage: '上一页',
  nextPage: '下一页',
  pageNumber: '第 {page} 页',
  timeline: '时间线',
  addTag: '添加标签',
  tagsSelected: '已选标签',
  removeTag: '移除{tag}',
  tagLimit: '最多 {count} 个标签',
  calendar: '日历',
  today: '今天',
  previousMonth: '上个月',
  nextMonth: '下个月',
  table: '数据表',
  tree: '树形列表',
  loading: '加载中',
  selectDate: '选择日期',
  chooseDate: '选择日期',
  clearDate: '清除日期',
  carousel: '轮播图',
  slide: '幻灯片',
  previousSlide: '上一张',
  nextSlide: '下一张',
  goToSlide: '转到第 {index} 张',
  slideOf: '第 {index} 张，共 {total} 张',
  dropFiles: '拖放文件到这里，或点击浏览',
  browseFiles: '浏览文件',
  selectedFiles: '已选文件',
  removeFile: '移除{name}',
  filesSkipped: '部分文件已跳过。',
  fileTooLarge: '{name} 超过大小限制',
  fileTypeRejected: '{name} 类型不支持',
  tooManyFiles: '最多 {count} 个文件',
};

const BASE_MESSAGES: Record<PixelValeLocale, LocaleMessages> = {
  en: EN,
  'zh-CN': ZH_CN,
};

export function interpolateMessage(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function getLocaleMessages(
  locale: PixelValeLocale,
  overrides?: LocaleMessagesOverride,
): LocaleMessages {
  const base = BASE_MESSAGES[locale] ?? EN;
  return overrides ? { ...base, ...overrides } : base;
}

export { BASE_MESSAGES };
