import { isAIGuideFactType, isAIGuideSource, type AIGuideFactType, type AIGuideSource } from "./types";

export type GuideKnowledgeItem = {
  id: string;
  factType: AIGuideFactType;
  keywords: string[];
  spotIds?: string[];
  safeAnswer: string;
  context: string;
  sources: AIGuideSource[];
};

const checkedAt = "2026-08-14";

export const evidenceBoundarySource: AIGuideSource = {
  id: "BOUNDARY-2026-08-14",
  title: "六祖云游 Discovery：动态信息与路线证据边界",
  publisher: "六祖云游项目研究",
  checkedAt,
  evidenceLevel: "PROJECT",
  factType: "realtime_status",
  reviewStatus: "PROJECT_BOUNDARY_ONLY",
  sourceStatus: "PROJECT_INTERNAL",
  note: "当前原型未取得发布级开放、票务、入口、内部路线、安全或无障碍实时数据。",
};

export const sourceLz001: AIGuideSource = {
  id: "LZ-001",
  title: "六祖故里旅游度假区",
  publisher: "云浮市人民政府（来源：新兴县人民政府）",
  url: "https://www.yunfu.gov.cn/zjyf/lyyf/msfj/content/post_1582810.html",
  checkedAt,
  evidenceLevel: "A",
  factType: "official_current",
  reviewStatus: "PROJECT_SOURCE_CHECKED",
  sourceStatus: "OFFICIAL_PRIMARY",
  note: "支持目的地层级与资源线索，不提供正式边界、实时开放或内部路线。",
};

export const sourceLz003: AIGuideSource = {
  id: "LZ-003",
  title: "第八批全国重点文物保护单位名单（国恩寺条目）",
  publisher: "国家文物局",
  url: "https://www.ncha.gov.cn/art/2019/10/18/art_2289_157100.html",
  checkedAt,
  evidenceLevel: "A",
  factType: "historical_record",
  reviewStatus: "PROJECT_SOURCE_CHECKED",
  sourceStatus: "OFFICIAL_PRIMARY",
  note: "名单年代栏是保护对象口径，不等同于寺院创建年代。",
};

export const sourceLz005: AIGuideSource = {
  id: "LZ-005",
  title: "禅宗祖师传说（六祖传说）",
  publisher: "中国非物质文化遗产网·中国非物质文化遗产数字博物馆",
  url: "https://www.ihchina.cn/project_details/23638.html",
  checkedAt,
  evidenceLevel: "A",
  factType: "local_legend",
  reviewStatus: "PROJECT_SOURCE_CHECKED",
  sourceStatus: "OFFICIAL_PRIMARY",
  note: "该来源将相关口传故事归入民间文学，不能据此把传说写成史实。",
};

export const sourceLz006: AIGuideSource = {
  id: "LZ-006",
  title: "省级非物质文化遗产项目：六祖诞庙会",
  publisher: "新兴县文化广电旅游体育局",
  url: "https://www.xinxing.gov.cn/xxxrmzf/zjxx/xxwh/whyc/content/post_1715901.html",
  checkedAt,
  evidenceLevel: "A",
  factType: "religious_tradition",
  reviewStatus: "PROJECT_SOURCE_CHECKED",
  sourceStatus: "OFFICIAL_PRIMARY",
  note: "支持地方传统与节庆文化背景；具体年度活动须查询当年官方公告。",
};

export const productSource: AIGuideSource = {
  id: "GUIDE-SCOPE-V1",
  title: "六祖云游 AI 导游原型能力边界",
  publisher: "六祖云游项目",
  checkedAt: "2026-08-15",
  evidenceLevel: "PROJECT",
  factType: "interpretation",
  reviewStatus: "PROJECT_BOUNDARY_ONLY",
  sourceStatus: "PROJECT_INTERNAL",
  note: "AI 只整理已登记资料；不生成实时状态、权威路线或安全结论。",
};

const knowledgeItems: GuideKnowledgeItem[] = [
  {
    id: "guoen-heritage",
    factType: "historical_record",
    keywords: ["国恩寺", "文物", "保护单位", "年代", "始建", "建筑"],
    spotIds: ["guoen-temple"],
    safeAnswer:
      "国家文物局公布的第八批全国重点文物保护单位名单列有国恩寺，类别为古建筑，年代栏为“明至民国”。这个年代是保护对象的名录口径，不能直接当作寺院的创建年份；现有公开材料对始建年份存在冲突，所以这里不替你选定一个说法。[LZ-003]",
    context:
      "国恩寺列入第八批全国重点文物保护单位，编号 8-0407-3-210，类别为古建筑，年代栏为明至民国，地点为广东省新兴县。该年代是保护对象口径，不等于寺院创建年代；公开材料中的创建年份存在冲突。",
    sources: [sourceLz003],
  },
  {
    id: "huineng-and-legends",
    factType: "local_legend",
    keywords: ["六祖", "惠能", "传说", "非遗", "心动", "幡动", "藏佛坑", "民间文学"],
    safeAnswer:
      "国家非遗数字博物馆把“禅宗祖师传说（六祖传说）”列为国家级非遗代表性项目扩展项目，类别是“民间文学”，保护单位为新兴县文化馆。因此，相关故事适合明确标注为“非遗传说”来讲，不能写成已经由史料证实的事件。[LZ-005]",
    context:
      "禅宗祖师传说（六祖传说）在 2021 年列入第五批国家级非物质文化遗产代表性项目名录扩展项目，项目序号 1040、编号 I-96，类别为民间文学，保护单位为新兴县文化馆。来源页面记录惠能生卒年为 638 至 713，并收录多项口传故事。",
    sources: [sourceLz005],
  },
  {
    id: "liuzu-festival",
    factType: "religious_tradition",
    keywords: ["六祖诞", "庙会", "二月初八", "八月初三", "节庆", "春秋二祭"],
    safeAnswer:
      "新兴县文旅部门的非遗介绍把农历二月初八、八月初三与当地“春秋二祭”的传统联系起来，并记录了相关庙会文化。它能说明地方传统背景，但不能代替某一年度的寺院或主办方公告；如果你问今年是否举办、几点开始，我目前不能确认。[LZ-006]",
    context:
      "新兴县文化广电旅游体育局的六祖诞庙会介绍记录农历二月初八、八月初三相关纪念习俗与庙会文化。具体年度是否举办、时间、规模、管制和宗教活动安排必须逐年核验。",
    sources: [sourceLz006],
  },
  {
    id: "scenic-scope",
    factType: "official_current",
    keywords: ["六祖镇", "度假区", "景区", "范围", "核心区", "有哪些"],
    safeAnswer:
      "六祖镇、六祖故里旅游度假区和国恩寺并不是同一个地理层级。官方目的地介绍确认六祖故里旅游度假区位于新兴县六祖镇，并列出国恩寺、六祖故居、藏佛坑、龙山温泉等资源；但这份介绍不能替代正式景区边界、入口或实时开放资料。[LZ-001]",
    context:
      "官方目的地介绍确认六祖故里旅游度假区位于新兴县六祖镇，并列出国恩寺、千年古荔、六祖故居、藏佛坑、龙山温泉等体验资源。该页面不提供法定边界、内部从属、实时开放或精确入口。",
    sources: [sourceLz001],
  },
  {
    id: "guide-capabilities",
    factType: "interpretation",
    keywords: ["你好", "你是谁", "能做什么", "禅小荔", "帮助", "怎么问"],
    safeAnswer:
      "我是禅小荔的 AI 导游原型，可以根据已登记、可追溯的资料介绍六祖文化，并把史实、宗教传统和民间传说分开说明。开放时间、票价、入口、路线和安全状态如果没有当前权威来源，我会直接说不能确认。[GUIDE-SCOPE-V1]",
    context:
      "产品能力边界：只整理已登记且带来源的文化资料；模型不得创造坐标、入口、路线、开放、安全、票价、客流或无障碍事实；未知信息明确拒答。",
    sources: [productSource],
  },
];

const dynamicOrSafetyPattern =
  /开放|开门|闭馆|营业|门票|票价|收费|停车|车位|班次|首末班|天气|客流|拥挤|封闭|施工|安全|危险|无障碍|轮椅|实时|现在|今天|明天|拍摄|拍照|录音|法会|怎么走|路线|导航|入口|距离|多久|交通/;

function normalizeQuestion(question: string) {
  return question.toLowerCase().replace(/\s+/g, "");
}

export function isGuideKnowledgeItem(item: GuideKnowledgeItem): boolean {
  return (
    item.id.trim().length > 0 &&
    isAIGuideFactType(item.factType) &&
    item.keywords.length > 0 &&
    item.sources.length > 0 &&
    item.sources.every(isAIGuideSource) &&
    item.sources.some((source) => source.factType === item.factType) &&
    item.safeAnswer.trim().length > 0 &&
    item.context.trim().length > 0
  );
}

export function asksForDynamicOrSafetyFact(question: string) {
  return dynamicOrSafetyPattern.test(normalizeQuestion(question));
}

export function retrieveGuideKnowledge(question: string, spotId?: string) {
  const normalized = normalizeQuestion(question);

  return knowledgeItems
    .filter(isGuideKnowledgeItem)
    .map((item) => {
      const keywordScore = item.keywords.reduce(
        (score, keyword) => score + (normalized.includes(keyword.toLowerCase()) ? 1 : 0),
        0,
      );
      const spotScore = spotId && item.spotIds?.includes(spotId) ? 2 : 0;
      return { item, score: keywordScore + spotScore };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ item }) => item);
}

export type GuideSpotStory = {
  body: string;
  factTypes: AIGuideFactType[];
  sources: AIGuideSource[];
};

const spotStories: Record<string, GuideSpotStory> = {
  "guoen-temple": {
    body: "国恩寺已列入第八批全国重点文物保护单位，名录中的保护对象年代口径为“明至民国”。寺院创建年代与宗教传说需要分开讲述，当前原型不会把有冲突的年份写成定论。",
    factTypes: ["historical_record"],
    sources: [sourceLz003],
  },
  "huineng-residence": {
    body: "官方目的地介绍把六祖故居列为六祖故里旅游度假区的资源线索；这只能支持候选文化节点展示，不能替代正式入口、开放或从属边界核验。",
    factTypes: ["official_current"],
    sources: [sourceLz001],
  },
  "zangfo-valley": {
    body: "官方目的地介绍提及藏佛坑这一资源线索；当前点位仍待现场消歧，不能据此生成入口、山路或安全导航。",
    factTypes: ["official_current"],
    sources: [sourceLz001],
  },
  "longshan-spring": {
    body: "官方目的地介绍把龙山温泉列为当地体验资源；当前原型只将其作为候选节点，实时营业、票务和交通状态仍需另行核验。",
    factTypes: ["official_current"],
    sources: [sourceLz001],
  },
  "chanyu-town": {
    body: "当前只保留这一候选节点用于原型探索，尚无可公开的已登记文化讲解；系统不会用模型记忆补写故事或运营状态。",
    factTypes: ["interpretation"],
    sources: [productSource],
  },
};

export function getGuideSpotStory(spotId: string): GuideSpotStory | null {
  const story = spotStories[spotId];
  if (
    !story ||
    story.factTypes.length === 0 ||
    !story.factTypes.every(isAIGuideFactType) ||
    story.sources.length === 0 ||
    !story.sources.every(isAIGuideSource)
  ) {
    return null;
  }
  const sourceTypes = new Set(story.sources.map((source) => source.factType));
  if (story.factTypes.some((factType) => !sourceTypes.has(factType))) return null;
  return story;
}

export function getUnknownFactAnswer(question: string) {
  const subject = question.length > 30 ? "这项信息" : "“" + question + "”";
  return (
    "我目前不能确认" +
    subject +
    "。它涉及实时开放、路线、入口、交通、安全或现场规则，而当前原型没有对应的发布级权威数据。请以景区现场最新公告或工作人员答复为准；我不会用旧资料或猜测补全。[BOUNDARY-2026-08-14]"
  );
}
