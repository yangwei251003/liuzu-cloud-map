export const ARRIVAL_MODES = ["drive", "rail", "local"] as const;

export type ArrivalMode = (typeof ARRIVAL_MODES)[number];

export type ArrivalEvidence = {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  checkedAt: string;
  level: "A" | "B";
  statement: string;
  limitation: string;
  url: string;
};

export type ArrivalPlan = {
  mode: ArrivalMode;
  label: string;
  shortLabel: string;
  summary: string;
  steps: string[];
  confirmToday: string[];
  evidenceIds: string[];
};

export const ARRIVAL_EVIDENCE: ArrivalEvidence[] = [
  {
    id: "LZ-012",
    title: "六祖故里旅游度假区游客中心揭牌",
    publisher: "新兴县人民政府",
    publishedAt: "2025-06-27",
    checkedAt: "2026-08-14",
    level: "A",
    statement: "官方报道可证明游客中心节点已经揭牌并曾投入活动使用。",
    limitation: "不能据此推断每天开放、全部服务持续可用，也不能把报道位置当作核验入口。",
    url: "https://www.xinxing.gov.cn/gkmlpt/content/1/1928/post_1928733.html",
  },
  {
    id: "LZ-015",
    title: "新兴南站启用及三条接驳专线开通报道",
    publisher: "云浮市人民政府门户转载《云浮日报》",
    publishedAt: "2025-12-23",
    checkedAt: "2026-08-14",
    level: "B",
    statement: "报道可证明新兴南站已启用，开通方案包含国恩寺方向的接驳关系。",
    limitation: "线路、停靠站、班次、票价和持续运营都可能变化，不能作为今天的公交时刻表。",
    url: "https://www.yunfu.gov.cn/zxzx/bmdt/content/post_1973273.html",
  },
  {
    id: "LZ-016",
    title: "新兴南站运营及公共交通接驳意见征集",
    publisher: "新兴县交通运输局",
    publishedAt: "2026-01-06",
    checkedAt: "2026-08-14",
    level: "A",
    statement: "官方征集事项覆盖线路、站点、班次、首末班、网约车、停车与换乘。",
    limitation: "它证明接驳体验仍在优化，不证明任何具体服务今天存在或缺失。",
    url: "https://www.xinxing.gov.cn/yfxxjtj/gkmlpt/content/1/1977/post_1977622.html",
  },
  {
    id: "LZ-026",
    title: "新兴县政府定价经营服务性收费目录（截至 2026-06-30）",
    publisher: "新兴县发展和改革局",
    publishedAt: "2026-07-01",
    checkedAt: "2026-08-14",
    level: "A",
    statement: "可确认新兴县县级最新收费目录页面已经正式发布。",
    limitation: "项目尚未从附件核出当前智慧停车场条目；页面不等于实时余位，产品不展示猜测价格。",
    url: "https://www.xinxing.gov.cn/xxxrmzf/mhwz/jghsf/mlqd/content/post_2022349.html",
  },
];

export const ARRIVAL_PLANS: Record<ArrivalMode, ArrivalPlan> = {
  drive: {
    mode: "drive",
    label: "自驾或网约车",
    shortLabel: "自驾",
    summary: "先抵达管理方确认的停车或上下客点，再按现场标识进入；地图上的景点中心点不能代替入口。",
    steps: [
      "出发前从交通主管部门或现场服务渠道确认临时管制与停车状态。",
      "到达后只采用现场停车、上下客和入口标识，不把本项目候选坐标当导航终点。",
      "在游客中心或现场工作人员处确认核心区、当日开放点与返程安排。",
    ],
    confirmToday: ["停车场是否开放及余位", "当日收费公示", "临时交通管制", "无障碍下客与通行"],
    evidenceIds: ["LZ-012", "LZ-026"],
  },
  rail: {
    mode: "rail",
    label: "高铁到新兴南站",
    shortLabel: "高铁",
    summary: "新兴南站与国恩寺方向接驳关系有官方开通报道，但本产品没有今天的班次数据。",
    steps: [
      "抵站前重新核对当天接驳线路、上车点、首末班与支付方式。",
      "若接驳状态无法确认，优先向车站服务人员询问，不依据旧报道推断仍在运行。",
      "到景区后再由游客中心或现场标识确认入口，不把“国恩寺方向”理解为寺院门口直达。",
    ],
    confirmToday: ["接驳是否运行", "上车点与停靠站", "首末班和票价", "错过班次后的返程方案"],
    evidenceIds: ["LZ-015", "LZ-016", "LZ-012"],
  },
  local: {
    mode: "local",
    label: "已经在六祖镇周边",
    shortLabel: "已在附近",
    summary: "先确认自己处于核心文化服务区还是外围体验节点；多个宣传点位不能默认连续步行可达。",
    steps: [
      "先到现场游客服务点或依据现场总导览图确认当前位置与开放范围。",
      "把国恩寺、游客中心及龙潭湖视为待管理方最终确认的核心候选，不自行推断正式边界。",
      "故居、藏佛坑、禅域小镇和温泉等按外围候选单独规划交通，不串成未经复走的步行线。",
    ],
    confirmToday: ["当前所在范围", "正式入口与出口", "步道开放和安全状态", "返回停车点或车站的方式"],
    evidenceIds: ["LZ-012", "LZ-016"],
  },
};

export const ARRIVAL_SCOPE = {
  core: {
    title: "核心文化与服务区候选",
    places: ["游客中心", "国恩寺", "龙潭湖周边"],
    note: "来自 Discovery 审核推荐范围，不是管理方正式边界。",
  },
  extended: {
    title: "外围与跨点位候选",
    places: ["六祖惠能故居", "藏佛坑", "惠能广场", "禅域小镇", "龙山温泉"],
    note: "点位可能相隔较远，不能默认连续步行可达。",
  },
} as const;

export function getArrivalPlan(mode: string): ArrivalPlan | null {
  return ARRIVAL_MODES.includes(mode as ArrivalMode) ? ARRIVAL_PLANS[mode as ArrivalMode] : null;
}

export function getArrivalEvidence(plan: ArrivalPlan): ArrivalEvidence[] {
  return plan.evidenceIds.map((id) => ARRIVAL_EVIDENCE.find((item) => item.id === id)).filter((item): item is ArrivalEvidence => Boolean(item));
}
