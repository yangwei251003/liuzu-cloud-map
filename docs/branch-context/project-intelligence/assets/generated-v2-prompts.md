# ImageGen V2 地图与宣传视觉资产提示词记录

生成日期：2026-08-15（Asia/Shanghai）  
生成方式：Codex 内置 ImageGen（每个资产单独调用）  
用途：本地原型的地图艺术覆盖层、首页宣传轮播与候选 POI 视觉标志

## 披露与边界

- 本文登记的 13 个文件均为 AI 生成的原创概念美术，不是景区官方图片、实景摄影、GIS 数据、数字孪生或建筑测绘成果。
- 四张地图皮肤仅提供颜色、纸张、笔触、植被和空间氛围；不包含道路、路线、POI、坐标、文字或真实地理声明。事实地图、道路与 POI 应继续由已接入且合规使用的高德图层提供。
- 四张宣传图无文字、Logo 和水印；前端叠加标题时必须继续显示“AI 概念影像 / 非实景”等披露。
- 五个 2.5D 图标是候选点的视觉助记符，不是对应地点真实建筑或真实地形的复原。上线前不得用它们证明建筑外观、设施状态、地理形态或可达路线。
- 四张用户参考图仅作为风格参考；生成时明确禁止复制其中的 UI、文字、道路、标注、建筑或地理布局。
- 地图皮肤与宣传图统一转换为 `1600×900 WebP`；标志图的去污染母版保留在 Codex 生成目录，`public` 交付文件缩放为 `320×320 WebP` 并保留真实 Alpha 透明通道（校验范围 `0–255`）。
- 五个标志在最终冻结前另做透明边缘去污染：用临近不透明内色替换半透明边缘的异常红/洋红/荧光绿/黄/青色，采用预乘 Alpha 缩放、清除极低 Alpha 噪点，并以 lossless WebP 保存；不改变主体构图和透明通道。

## 一、地图艺术覆盖图

### 1. 青山绿水水彩

输出：`source-code/web/public/assets/map-skins/v4/green-water-atlas-v1.webp`

```text
Use case: stylized-concept
Asset type: wide raster art overlay for a real interactive tourist map
Primary request: create an original Qing-shan-lü-shui watercolor terrain atmosphere inspired only by the palette, brushwork, soft elevation layering, and airy luminosity of Image 1.
Input images: Image 1 is a style reference only; do not copy its UI, labels, roads, POIs, layout, or geography.
Scene/backdrop: imagined southern Chinese subtropical landscape viewed from a high oblique/top-down angle, overlapping gentle green ridges, a broad turquoise lake, narrow pale-blue streams, clusters of lychee-like orchards, light mist and soft cloud wisps.
Style/medium: premium hand-painted travel-atlas watercolor, delicate gouache accents, lightly textured paper, polished production asset.
Composition/framing: seamless-feeling 16:9 wide environmental field, edge-to-edge artwork, balanced detail across the canvas, no single focal landmark, suitable as a low-opacity overlay beneath factual map labels.
Lighting/mood: bright spring daylight, tranquil, fresh, inviting.
Color palette: jade, celadon, leaf green, pale lime, turquoise and warm ivory.
Materials/textures: layered watercolor washes, tiny varied tree masses, soft topographic shading.
Constraints: entirely original; no text, no letters, no numerals, no logo, no watermark, no UI, no roads, no route lines, no map markers, no labels, no compass, no real place geometry, no recognizable real building; concept art only; approximately 1600x900 landscape.
Avoid: screenshot look, web interface, satellite imagery, photorealism, flat empty gradients, fantasy castles, duplicated symbols.
```

### 2. 禅意水墨宣纸

输出：`source-code/web/public/assets/map-skins/v4/zen-ink-atlas-v1.webp`

```text
Use case: stylized-concept
Asset type: wide raster art overlay for a real interactive tourist map
Primary request: create an original Zen ink-wash terrain atmosphere inspired only by the xuan-paper texture, restrained brushwork, pale jade water, mist and spacious calm of Image 1.
Input images: Image 1 is a style reference only; do not copy its UI, labels, roads, POIs, layout, or geography.
Scene/backdrop: imagined Lingnan foothills from a high oblique/top-down view, softly receding ink mountains, a quiet irregular lake, a few pale streams, ghosted bamboo and orchard silhouettes dissolving into mist.
Style/medium: refined Chinese shan-shui ink wash on warm ivory xuan paper, mineral green accents, subtle dry-brush topographic texture, production-quality editorial illustration.
Composition/framing: 16:9 edge-to-edge atmospheric field with abundant calm negative space and balanced tonal detail, suitable as a low-opacity overlay under factual map labels.
Lighting/mood: contemplative morning haze, quiet and luminous.
Color palette: warm ivory, pale stone gray, charcoal wash, desaturated sage and jade-blue.
Materials/textures: visible absorbent paper fibers, feathered ink edges, dry-brush ridges, translucent mineral pigment.
Constraints: entirely original; no text, no letters, no numerals, no logo, no watermark, no UI, no roads, no route lines, no map markers, no labels, no compass, no real place geometry, no recognizable real building; concept art only; approximately 1600x900 landscape.
Avoid: screenshot look, interface chrome, hard black blocks, saturated colors, satellite imagery, photorealism, fantasy architecture, empty plain background.
```

### 3. 深靛复古描金

输出：`source-code/web/public/assets/map-skins/v4/retro-indigo-atlas-v1.webp`

```text
Use case: stylized-concept
Asset type: wide raster art overlay for a real interactive tourist map
Primary request: create an original dark retro Chinese atlas atmosphere inspired only by Image 1's deep indigo paper, restrained antique-gold contour accents, smoky ink clouds, and museum-map refinement.
Input images: Image 1 is a style reference only; do not copy its UI, labels, roads, POIs, layout, or geography.
Scene/backdrop: imagined Lingnan mountain-and-water terrain seen from high oblique/top-down, layered shadowy ridges around a quiet lake, faint vegetation and cloud textures emerging from darkness.
Style/medium: premium hand-painted cartographic concept texture on aged indigo-black paper, subtle mineral-pigment lake, hairline antique-gold topographic contour ornament, sophisticated Chinese archival aesthetic.
Composition/framing: full 16:9 edge-to-edge environmental field, elegant tonal variation across the canvas, clear darker and lighter zones so factual map labels can remain readable.
Lighting/mood: nocturnal, mysterious, calm, culturally refined rather than ominous.
Color palette: near-black navy, deep indigo, smoked teal, muted malachite and antique gold.
Materials/textures: fibrous dark paper, ink blooms, rubbed metallic pigment, understated cloud grain.
Constraints: entirely original; no text, no letters, no numerals, no logo, no watermark, no UI, no roads, no route lines, no map markers, no labels, no compass, no real place geometry, no recognizable real building; concept art only; approximately 1600x900 landscape.
Avoid: screenshot look, interface frames, bright neon, high-tech HUD, photorealism, fantasy castles, prominent straight lines, dense decorative borders.
```

### 4. Lush 3D / 2.5D 岭南山水

输出：`source-code/web/public/assets/map-skins/v4/three-d-isometric-atlas-v1.webp`

```text
Use case: stylized-concept
Asset type: wide raster art overlay for a real interactive tourist map
Primary request: create an original lush 3D/2.5D Lingnan mountain-and-water environment inspired only by Image 1's high oblique viewpoint, dimensional terrain modeling, vivid vegetation, turquoise water, haze, and polished scenic-map rendering.
Input images: Image 1 is a style reference only; do not copy its UI, labels, roads, POIs, layout, specific buildings, or geography.
Scene/backdrop: an imagined subtropical valley and lake system surrounded by forested karst-like hills, orchard terraces, streams and gentle cliffs; a few tiny generic roof clusters embedded unobtrusively to suggest scale, not a real destination.
Style/medium: premium isometric 3D illustration with painterly realism, hand-finished matte surfaces, detailed vegetation masses and atmospheric depth, suitable for a tourism map skin.
Composition/framing: 16:9 edge-to-edge bird's-eye/isometric environmental field, broad central water and multiple elevation tiers, distributed details with no dominant landmark, usable below factual map labels.
Lighting/mood: warm clear daylight after rain, fresh and inviting, soft volumetric cloud wisps.
Color palette: lush emerald, moss, jade, turquoise, stone gray, warm terracotta accents.
Materials/textures: miniature-diorama terrain, finely modeled trees, water reflections, rock and orchard texture.
Constraints: entirely original; no text, no letters, no numerals, no logo, no watermark, no UI, no roads, no route lines, no map markers, no labels, no compass, no real place geometry, no recognizable or claimed real building; concept art only; approximately 1600x900 landscape.
Avoid: screenshot look, interface, game HUD, toy-plastic look, uncanny architecture, fantasy monuments, satellite imagery, flat terrain, duplicated structures.
```

## 二、宣传轮播概念图

### 5. 国恩禅境

输出：`source-code/web/public/assets/promotions/v2/guoen-chan-culture-poster.webp`

```text
Use case: ads-marketing
Asset type: 16:9 scenic-area promotional carousel poster, image-only
Primary request: an original AI concept poster evoking a serene Guoen Zen cultural journey, using Image 1 only as a reference for refined xuan-paper texture, soft ink atmosphere, jade accents and spacious calm.
Input images: Image 1 is a style reference only; do not copy its UI, labels, map layout, buildings, or geography.
Scene/backdrop: dawn mist among southern Chinese hills, a calm lotus-edged pond and a distant generic Lingnan Buddhist courtyard silhouette partially hidden by bamboo, with a stone path leading gently inward.
Subject: contemplative landscape and journey atmosphere; architecture is small, generic and non-documentary.
Style/medium: premium contemporary Chinese ink-and-mineral-pigment campaign illustration, elegant, cinematic yet restrained.
Composition/framing: wide 16:9, layered depth, strong visual entry along the path, generous quiet sky/mist area for optional UI copy added later outside the bitmap.
Lighting/mood: pearl morning light, reverent, welcoming, tranquil.
Color palette: ivory, ink gray, desaturated jade, muted pine, tiny warm amber accents.
Materials/textures: xuan-paper fibers, feathered wash, soft mineral pigment, subtle filmic haze.
Constraints: concept art only, not a depiction of the real Guoen Temple; no text, no calligraphy, no letters, no numerals, no logo, no watermark, no UI, no map labels, no recognizable or claimed real building, no religious figure.
Avoid: tourist crowds, commercial signage, fantasy palace, ornate invented architectural detail, photorealistic claim, dark horror mood.
```

### 6. 香荔故里

输出：`source-code/web/public/assets/promotions/v2/lingnan-lychee-journey-poster.webp`

```text
Use case: ads-marketing
Asset type: 16:9 scenic-area promotional carousel poster, image-only
Primary request: an original AI concept poster celebrating a Lingnan lychee-homeland journey, inspired only by Image 1's bright watercolor palette, lush layered hills and travel-atlas polish.
Input images: Image 1 is a style reference only; do not copy its UI, labels, roads, POIs, layout, or geography.
Scene/backdrop: a sunlit subtropical orchard valley after rain, branches of ripe red lychees framing a winding footpath, soft green hills and a pale turquoise stream in the distance.
Subject: rich lychee fruit and welcoming orchard landscape, with a tiny distant generic pavilion only as atmosphere.
Style/medium: premium hand-painted travel campaign illustration, watercolor and gouache with refined botanical detail.
Composition/framing: cinematic wide 16:9, tactile lychee cluster in the foreground, layered scenic depth, open luminous area for optional external UI copy.
Lighting/mood: golden morning light, fresh, joyful, sensory and authentic in texture.
Color palette: lychee red, leaf green, celadon, warm gold and misty turquoise.
Materials/textures: natural fruit skin texture, wet leaves, watercolor paper grain, soft atmospheric haze.
Constraints: concept art only, not documentary photography; no text, no calligraphy, no letters, no numerals, no logo, no watermark, no UI, no map elements, no recognizable real building or real location claim.
Avoid: plastic-looking fruit, product-packaging shot, tourist crowds, over-saturation, fantasy landscape, duplicated fruit patterns.
```

### 7. 云游陪伴

输出：`source-code/web/public/assets/promotions/v2/cloud-tour-companion-poster.webp`

```text
Use case: ads-marketing
Asset type: 16:9 scenic-area promotional carousel poster, image-only
Primary request: an original AI concept poster for a gentle “cloud tour companion” experience, inspired only by Image 1's dimensional Lingnan landscape, cinematic depth and polished scenic-map rendering.
Input images: Image 1 is a style reference only; do not copy its UI, labels, roads, POIs, architecture, layout, or geography.
Scene/backdrop: a beautiful subtropical mountain-lake journey at the blue-gold edge of morning, terraced orchard hills, soft mist and a clear footpath curving toward the water.
Subject: a subtle ribbon of warm floating light accompanies the path like a helpful digital guide, expressed abstractly with small luminous motes and no character.
Style/medium: premium 2.5D painterly travel campaign artwork, realistic natural materials with a gentle storybook finish.
Composition/framing: wide 16:9, path beginning in foreground and unfolding through layered hills toward the lake, balanced negative space for external UI copy.
Lighting/mood: hopeful early light, reassuring, exploratory, calm companionship.
Color palette: pine and jade green, turquoise water, pearl mist, soft amber guide light.
Materials/textures: lush modeled foliage, natural stone path, soft water reflections, atmospheric cloud layers.
Constraints: concept art only; no text, no calligraphy, no letters, no numerals, no logo, no watermark, no UI, no map labels, no route-map graphics, no recognizable real building, no depiction of a real location, no humanoid or mascot.
Avoid: sci-fi HUD, neon ribbon, fantasy magic spell, tourist crowd, plastic 3D look, impossible architecture.
```

### 8. 夜游禅灯

输出：`source-code/web/public/assets/promotions/v2/night-chan-lantern-poster.webp`

```text
Use case: ads-marketing
Asset type: 16:9 scenic-area promotional carousel poster, image-only
Primary request: an original AI concept poster for a quiet night Zen-lantern walk, inspired only by Image 1's deep indigo paper atmosphere, antique-gold accents and sophisticated Chinese visual restraint.
Input images: Image 1 is a style reference only; do not copy its UI, labels, roads, POIs, buildings, layout, or geography.
Scene/backdrop: a moonlit southern Chinese garden path beside still water, bamboo and mountain silhouettes fading into blue night mist, a sequence of small warm paper lanterns guiding the path toward a distant generic covered pavilion.
Subject: lantern light, reflections and contemplative night landscape; architecture remains small and generic.
Style/medium: premium painterly travel campaign illustration combining indigo ink texture with subtle cinematic illumination.
Composition/framing: wide 16:9, curving path and lantern rhythm create depth, open dark area for optional external UI copy, polished carousel-ready framing.
Lighting/mood: hushed, intimate, safe and inviting, warm lantern glow against cool night.
Color palette: midnight indigo, smoked teal, charcoal, antique gold, warm amber.
Materials/textures: fibrous paper grain, soft ink blooms, natural lantern paper, water reflections, thin mist.
Constraints: concept art only; no text, no calligraphy, no letters, no numerals, no logo, no watermark, no UI, no map elements, no recognizable real building, no real destination claim, no religious figure.
Avoid: festival crowd, red neon, horror, fantasy palace, fireworks, ornate signage, excessive lantern density.
```

## 三、透明 2.5D 候选点标志

五个图标共用约束：独立单图、45° 轻俯视、柔和写实 2.5D、透明背景、无文字/坐标/Logo/水印，只作候选点视觉标记。以下每个提示词仍单独调用一次 ImageGen。

### 9. 国恩寺牌楼候选标志

输出：`source-code/web/public/assets/map-markers/v1/guoen-temple.webp`

```text
Use case: stylized-concept
Asset type: single 2.5D tourist-map landmark marker with transparent background
Primary request: create an original candidate visual marker for “Guoen Temple gate”, represented as a generic refined Lingnan Buddhist paifang/gatehouse, not a factual reconstruction of any real building.
Input images: Image 1 is a style reference only for polished 2.5D scenic-map rendering, soft realism, palette and lighting; do not copy its UI, map, labels or structures.
Subject: one compact symmetrical gatehouse with warm ochre walls, dark charcoal tiled eaves, muted vermilion timber and two understated stone side plinths; the central plaque area must be blank with no characters.
Style/medium: premium soft-realistic 2.5D isometric illustration, finely modeled but simplified enough to read at map-marker scale.
Composition/framing: isolated single object, consistent 45-degree slightly top-down view, centered, full silhouette visible, generous transparent padding, square canvas.
Lighting/mood: gentle daylight from upper left, soft ambient occlusion, small natural contact shadow.
Color palette: warm ochre, charcoal, muted vermilion, moss-green accents.
Constraints: genuinely transparent background and transparent empty space; no text, no calligraphy, no letters, no numerals, no logo, no watermark, no pin shape, no border, no pedestal label; candidate point marker only; do not claim or reproduce the real Guoen Temple architecture.
Avoid: sprite sheet, multiple variations, photographic cutout, fantasy palace, ornate invented inscriptions, cropped roof, white or checkerboard background.
```

### 10. 六祖惠能故居岭南院落候选标志

输出：`source-code/web/public/assets/map-markers/v1/huineng-residence.webp`

```text
Use case: stylized-concept
Asset type: single 2.5D tourist-map landmark marker with transparent background
Primary request: create an original candidate visual marker for the “Huineng residence” point, shown as a modest generic Lingnan courtyard home rather than a factual reconstruction.
Input images: Image 1 is a style reference only for polished 2.5D scenic-map rendering, soft realism, palette and lighting; do not copy its UI, map, labels or structures.
Subject: one compact L-shaped single-story courtyard dwelling with gray clay-tile roofs, warm limewashed walls, restrained dark timber doors, a small stone courtyard, one lychee tree and a simple low wall; no shrine, no statue and no inscription.
Style/medium: premium soft-realistic 2.5D isometric illustration, finely modeled yet clear at map-marker scale.
Composition/framing: isolated single landmark vignette, consistent 45-degree slightly top-down view, centered, entire footprint visible, generous transparent padding, square canvas.
Lighting/mood: gentle daylight from upper left, calm lived-in warmth, soft contact shadow.
Color palette: warm ivory, weathered gray tile, muted brown timber, lychee green with tiny red accents.
Constraints: genuinely transparent background and transparent empty space; no text, no calligraphy, no letters, no numerals, no logo, no watermark, no pin shape, no border, no pedestal label; candidate point marker only; do not claim or reproduce the actual historic residence.
Avoid: sprite sheet, multiple variations, grand palace, modern villa, ornate invented details, people, cropped roof, white or checkerboard background.
```

### 11. 龙山温泉候选标志

输出：`source-code/web/public/assets/map-markers/v1/longshan-hot-spring.webp`

```text
Use case: stylized-concept
Asset type: single 2.5D tourist-map landmark marker with transparent background
Primary request: create an original candidate visual marker for the “Longshan hot spring” point, depicted as a compact natural hot-spring garden vignette, not a factual reconstruction of a real facility.
Input images: Image 1 is a style reference only for polished 2.5D scenic-map rendering, soft realism, palette and lighting; do not copy its UI, map, labels or structures.
Subject: one irregular turquoise mineral pool edged with rounded gray boulders, three gentle steam plumes, bamboo and fern clusters, a tiny understated open timber shelter at the rear and one folded towel stone; no people.
Style/medium: premium soft-realistic 2.5D isometric illustration, detailed natural materials, clear at map-marker scale.
Composition/framing: isolated single landmark vignette, consistent 45-degree slightly top-down view, centered, full silhouette visible, generous transparent padding, square canvas.
Lighting/mood: gentle daylight from upper left, restorative, fresh, soft contact shadow.
Color palette: turquoise water, pale mineral blue, moss green, warm timber and stone gray.
Constraints: genuinely transparent background and transparent empty space; no text, no calligraphy, no letters, no numerals, no logo, no watermark, no pin shape, no border, no pedestal label; candidate point marker only; do not claim or reproduce the actual Longshan Hot Spring layout.
Avoid: sprite sheet, multiple variations, resort signage, swimming pool geometry, people, dramatic geyser, fantasy spa, cropped edges, white or checkerboard background.
```

### 12. 藏佛坑山谷候选标志

输出：`source-code/web/public/assets/map-markers/v1/zangfo-valley.webp`

```text
Use case: stylized-concept
Asset type: single 2.5D tourist-map landmark marker with transparent background
Primary request: create an original candidate visual marker for the “Zangfo valley” point, depicted as a compact secluded subtropical mountain-valley vignette rather than a factual reconstruction.
Input images: Image 1 is a style reference only for polished 2.5D scenic-map rendering, soft realism, palette and lighting; do not copy its UI, map, labels or structures.
Subject: two moss-covered rocky ridges forming a quiet narrow gorge, a clear stream and short waterfall entering a jade pool, dense ferns, bamboo and broadleaf shrubs, one simple stone footbridge; no temple and no religious object.
Style/medium: premium soft-realistic 2.5D isometric illustration, detailed natural materials, clear silhouette at map-marker scale.
Composition/framing: isolated single landscape vignette, consistent 45-degree slightly top-down view, centered, full terrain island visible, generous transparent padding, square canvas.
Lighting/mood: gentle daylight from upper left, secluded, cool, contemplative, soft contact shadow.
Color palette: moss and pine green, slate gray, jade-blue water, warm stone accents.
Constraints: genuinely transparent background and transparent empty space; no text, no calligraphy, no letters, no numerals, no logo, no watermark, no pin shape, no border, no pedestal label; candidate point marker only; do not claim or reproduce the actual Zangfo Valley geography.
Avoid: sprite sheet, multiple variations, Buddhist statue, shrine, cave inscription, fantasy ruins, dramatic cliffs, people, cropped terrain, white or checkerboard background.
```

### 13. 六祖小镇文化街区候选标志

输出：`source-code/web/public/assets/map-markers/v1/liuzu-town.webp`

```text
Use case: stylized-concept
Asset type: single 2.5D tourist-map landmark marker with transparent background
Primary request: create an original candidate visual marker for the “Liuzu town cultural district” point, depicted as a compact generic Lingnan cultural street vignette rather than a factual reconstruction.
Input images: Image 1 is a style reference only for polished 2.5D scenic-map rendering, soft realism, palette and lighting; do not copy its UI, map, labels or structures.
Subject: a small pedestrian lane opening into a stone-paved square, three varied two-story Lingnan shophouse facades with gray tiled roofs, restrained timber lattice, warm ivory walls, one lychee tree, a tiny open pavilion and hanging lantern shapes with no written marks; no people.
Style/medium: premium soft-realistic 2.5D isometric illustration, coherent miniature architecture, clear silhouette at map-marker scale.
Composition/framing: isolated single district vignette, consistent 45-degree slightly top-down view, centered, full footprint visible, generous transparent padding, square canvas.
Lighting/mood: gentle daylight from upper left, welcoming, cultured and lively without crowding, soft contact shadow.
Color palette: warm ivory, charcoal roof tile, muted terracotta and red, moss green, small amber accents.
Constraints: genuinely transparent background and transparent empty space; no text, no calligraphy, no letters, no numerals, no shop signs, no logo, no watermark, no pin shape, no border, no pedestal label; candidate point marker only; do not claim or reproduce the actual Liuzu Town streetscape.
Avoid: sprite sheet, multiple variations, theme-park castle, modern high-rise, dense commercial signage, people, cropped buildings, white or checkerboard background.
```

## 生成文件检查摘要

| 组别 | 数量 | 尺寸 | 格式/透明度 | 人工目视检查 |
|---|---:|---|---|---|
| 地图皮肤 | 4 | 1600×900 | WebP / RGB | 已检查：无文字、无 UI、无道路和真实地理声明 |
| 宣传轮播 | 4 | 1600×900 | WebP / RGB | 已检查：无文字、Logo、水印；均为概念画面 |
| 候选点标志 | 5 | 320×320 | WebP / RGBA，Alpha 0–255；单张 36–61 KB | 已检查：独立单图、透明背景、无文字/坐标 |

边缘专项 QA：五个候选点标志分别在白色、深松绿和现有高德地图截图背景上以 `48px`、`72px` 两档显示尺寸进行合成检查，未见红色或荧光绿色彩边；最终冻结文件保留 Alpha，不添加黑底、白底或棋盘格底。
