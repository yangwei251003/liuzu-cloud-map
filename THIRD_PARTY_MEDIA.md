> 历史设计/验收资料：部分原型媒体、字体、服务及交付方案不随本次公开副本提供。当前可运行范围与验证结果以根 README、THIRD_PARTY_NOTICES 和 docs/release-validation.md 为准。

# Third-party media

This file records media that is cleared for local product use under an explicit open license. Keep attribution with any published build that includes these files.

## Guo'en Temple

- Local file: `public/assets/media/scenic/licensed/guoen-temple-20260527-1280.jpg`
- Work: `国恩寺 20260527 144925.jpg`
- Subject: Guo'en Temple, Xinxing County, Yunfu, Guangdong
- Creator: Pkkj
- Source: https://commons.wikimedia.org/wiki/File:%E5%9B%BD%E6%81%A9%E5%AF%BA_20260527_144925.jpg
- License: CC BY-SA 4.0
- License URL: https://creativecommons.org/licenses/by-sa/4.0/
- Local transformation: resized by the Wikimedia thumbnail service to 1280 pixels wide; no content edit.
- Product use: authentic scenic-area photography. Do not present the photograph as proof of current opening, access, crowd, or route conditions.

The unchanged Commons original is also preserved at `public/assets/media/scenic/v2/guoen-temple-pkkj-20260527-original.jpg` (4003×3014, SHA-256 `86b61014a26c5a7ea7c6b62429ef97d22c15021766241cd79449bda0c83e9eb3`). The 1280-pixel file above remains the delivery-size copy.

## Xinxing County, Tianlu Mountain

The following photographs show Tianlu Mountain in Xinxing County. They are local-area context, not Guo'en Temple or Six Patriarch Town route evidence.

Creator for all listed files: Qiu Mao  
License for all listed files: CC BY 3.0  
License URL: https://creativecommons.org/licenses/by/3.0/

| Local file | Source work | Source page | Transformation |
|---|---|---|---|
| `public/assets/media/scenic/licensed/xinxing-tianlu-01.jpg` | `天露山越野穿越20160326 - panoramio (1).jpg` | https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(1).jpg | Resized by Wikimedia thumbnail service |
| `public/assets/media/scenic/licensed/xinxing-tianlu-02.jpg` | `天露山越野穿越20160326 - panoramio (10).jpg` | https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(10).jpg | Resized by Wikimedia thumbnail service |
| `public/assets/media/scenic/licensed/xinxing-tianlu-03.jpg` | `天露山越野穿越20160326 - panoramio (20).jpg` | https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(20).jpg | Resized by Wikimedia thumbnail service |

The unchanged Commons original for item `(1)` is preserved at `public/assets/media/scenic/v2/xinxing-tianlu-qiumao-20160326-01-original.jpg` (4912×3264, SHA-256 `cc37c52cfe6ed6922f69a3e9449551f9b5ad3305e682a2e5f98a6e6b96cb11bb`). It remains regional context only and is not mapped to a product spot ID.

Machine-readable rights, hashes and spot-identity boundaries are recorded in `public/assets/media/scenic/v2/manifest.json` and `src/lib/scenic-image-registry.ts`.

## Rights boundaries

- Government, temple, travel-platform, social-media, and news images found during research are not copied into `public` without a reusable license or written permission.
- Source links for rights-pending material stay in the project research ledger instead of the distributable app bundle.
- AI-generated video and illustration must be labeled as illustrative media and must not impersonate documentary photography.

## Typography and motion dependencies

- Package: `@fontsource/lxgw-wenkai@5.3.0`
  - Source: https://fontsource.org/fonts/lxgw-wenkai/install
  - Upstream: LXGW WenKai / 霞鹜文楷, derived from the Klee open-source project
  - License: SIL Open Font License 1.1 (package `LICENSE`)
  - Product use: cultural notes, scenic-place names, travel-story snippets and community card headings; not used for dense map data or action controls.
- Package: `@fontsource/ma-shan-zheng@5.3.0`
  - Source: https://fontsource.org/fonts/ma-shan-zheng/install
  - Upstream: Ma Shan Zheng / 马善政体 from Google Fonts
  - License: SIL Open Font License 1.1 (package `LICENSE`)
  - Product use: short Hero display phrases and selected promotional emphasis only; not used for body copy, buttons or route instructions.
- User-provided HanYi TTF files were inspected by font metadata and converted into local WOFF2 character subsets. The original TTF files remain outside the repository in the user's Downloads folder.
  - `8841c4b5366dbc90ce72a6e711bbdf35.ttf` → 汉仪尚巍手书 → `public/fonts/hy-shangwei-shoushu.woff2`
  - `b198902284b479584e241ee1df3eaa9a.ttf` → 汉仪曾翔禅趣体 → `public/fonts/hy-zengxiang-chanqu.woff2`
  - `bf8bf5a9ea2280fe1c1d19180af7a067.ttf` → 汉仪北魏写经 → `public/fonts/hy-beiwei-xiejing.woff2`
  - License: user-provided assets; commercial Web/embedded distribution rights are not inferred. The project records the supplied-file hashes and limits use to low-frequency cultural display roles pending written rights confirmation.
- User-provided Founder TTF files were inspected by font metadata and converted into local WOFF2 character subsets. The original files remain outside the repository in the user's Downloads folder.
  - `方正清刻本悦宋简体.ttf` → 方正清刻本悦宋简体 (`FZQKBYSJW`) → `public/fonts/fz-qingke-yuesong.woff2`
  - `方正宋刻本秀楷简体.ttf` → 方正宋刻本秀楷简体 (`FZSKBXKJW`) → `public/fonts/fz-songke-xiukai.woff2`
  - `方正行楷简体.ttf` → 方正行楷简体 (`FZXKJW`) → `public/fonts/fz-xingkai.woff2`
  - License: user-provided assets; commercial Web/embedded distribution rights are not inferred. Use is restricted to short cultural display roles until the user's license record is added.
- Founder Cloud optional adapter:
  - Official IDs: `FZXKJW` (方正行楷简体) and `FZQKBYSJW` (方正清刻本悦宋简体)
  - Source: https://shop.foundertype.com/index.php/CloudAuth/useFont/id/FZXKJW/font_name/%E6%96%B9%E6%AD%A3%E8%A1%8C%E6%A5%B7%E7%AE%80%E4%BD%93.html and https://shop.foundertype.com/index.php/CloudAuth/useFont/id/FZQKBYSJW/font_name/%E6%96%B9%E6%AD%A3%E6%B8%85%E5%88%BB%E6%9C%AC%E6%82%A6%E5%AE%8B%E7%AE%80%E4%BD%93.html
  - Runtime use: disabled unless `NEXT_PUBLIC_FOUNDER_CLOUD_KEY` is configured; no key value is stored in source or documentation. When enabled, the official SDK targets only `.founder-cloud-xingkai` and `.founder-cloud-qingke`, with local fallbacks preserved.

- Package: `@fontsource-variable/noto-sans-sc@5.3.0`
  - Source: https://fontsource.org/fonts/noto-sans-sc/install
  - Upstream: Google Noto Sans SC via Fontsource
  - License: SIL Open Font License 1.1 (package `LICENSE`)
  - Product use: UI, navigation, map controls, forms, route data, community and chat body copy.
- Package: `@fontsource-variable/noto-serif-sc@5.3.0`
  - Source: https://fontsource.org/fonts/noto-serif-sc/install
  - Upstream: Google Noto Serif SC via Fontsource
  - License: SIL Open Font License 1.1 (package `LICENSE`)
  - Product use: Hero display, scenic-place names, cultural story headings and selected editorial labels only.
- Animation dependency: existing `framer-motion@13.1.0`
  - Source: https://motion.dev/docs/framer
  - License: MIT (package metadata)
  - Product use: existing state transitions plus the reusable cultural reveal components; no second animation engine was added.
