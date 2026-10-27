# 许可、资料与素材边界

自有代码、文档和本次公开整理采用根目录 MIT；第三方代码、字体、地图数据库和照片维持自己的许可，不被重新授权为 MIT。未知再分发权素材不附带文件，只保留 [来源/哈希索引](docs/provenance/unpublished-file-index.json)。

## 开放许可照片

| 当前文件 | 作者与来源 | 许可 | 用途 |
| --- | --- | --- | --- |
| `public/assets/media/scenic/licensed/guoen-temple-20260527-1280.jpg` 与对应 v2 大图 | Pkkj · [国恩寺 20260527 144925.jpg](https://commons.wikimedia.org/wiki/File:%E5%9B%BD%E6%81%A9%E5%AF%BA_20260527_144925.jpg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | 仅国恩寺建筑实景，不证明当前开放/安全 |
| `xinxing-tianlu-01.jpg` 与对应 v2 大图 | Qiu Mao · [天露山 panoramio (1)](https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(1).jpg) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 新兴县区域语境，不冒充六祖镇其他景点 |
| `xinxing-tianlu-02.jpg` | Qiu Mao · [天露山 panoramio (10)](https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(10).jpg) | CC BY 3.0 | 同上 |
| `xinxing-tianlu-03.jpg` | Qiu Mao · [天露山 panoramio (20)](https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(20).jpg) | CC BY 3.0 | 同上 |

来源原图已经由原项目保存；本次清除 JPEG 的 EXIF/XMP 元数据段，不重新编码图像扫描数据。源文件哈希与当前文件哈希见 [转换记录](docs/provenance/photo-metadata-transforms.json)，当前文件按原照片许可分享；不得将文件名中的 original 理解为字节完全未修改。裁切/缩放等更早变更详见原 [照片清单](public/assets/media/scenic/v2/manifest.json)。许可全文见 `third-party/licenses/CC-BY-*`。截图中出现这些照片也保留上述署名与许可范围。

## 项目生成美术

`public/assets/images/liuzu-journey-hero-ai-v1.png` 以及 13 项 v4 地图艺术底纹、v2 主题海报、v1 候选点图标，有本项目 ImageGen 生成记录、提示词和哈希，见 [元数据](docs/provenance/generated-v2-manifest.json)、[提示词](docs/provenance/generated-v2-prompts.md) 与 [原台账](docs/provenance/资产登记表.md)。它们仅为 AI 概念示意，不是实景、测绘资料、建筑复原或导航数据。

公开副本的 `public/assets/hero/public/cloud-loop.mp4` 与海报，由同一作者的独立 Vite 六祖云游项目原创云雾时间线生成，来源为该项目 `media/hero-motion/` 及其生成记录；借用范围仅该视觉资产，不混用两个项目的功能。媒体 SHA256 另列本仓库发布清单。AI 输出没有获得在所有法域中享有排他版权的保证。

未知权利的 Logo、禅小荔角色/动作、用户提供的概念视频、69MB 旅游纪实视频、景区截图修复图、参考截图衍生 v5 装饰及六个汉仪/方正字体 WOFF2 不分发。公开界面采用文字品牌/向导、已登记原创 AI 装饰和已清权照片；旧素材登记保留仅作来源记录，`publishable: false` 不会被选入公开相册。

## 地图与字体

`public/data/gis` 的公开 OSM 派生数据库单独遵守 ODbL 1.0，© OpenStreetMap contributors，见 [数据说明](public/data/gis/README.md) 与 [许可 URI 声明](third-party/licenses/ODbL-1.0-NOTICE.txt)。原型连线不是正式导航，正式快照仍为 DRAFT 空数据。没有打包供应商地图瓦片、私人轨迹或私人用户位置。

Noto Sans/Serif SC、霞鹜文楷、Ma Shan Zheng 来自 Fontsource 的开放字体包，遵守 SIL OFL 1.1，包内许可随依赖许可索引保存。仅保留新字体角色/动效与开源回退，商业字体文件及 @font-face 引用已移除。方正云字库接入是默认关闭的可选适配器，使用者须自行具备供应商授权和所需 Key；不随公开预览注入。

MapLibre 及实际随包的 worker/shared runtime 遵循 BSD；安装脚本从锁定的已修补版本同步它们，保留上游头部和许可。三端开发线的 Leaflet 1.9.4 遵循 BSD-2-Clause，原文件头及许可全文保留。地图底图服务另受供应商使用条款约束，不因为 SDK 开源而获得瓦片离线缓存权。

Android 壳保留 Gradle Wrapper 与配置，Wrapper 属 Gradle 上游 Apache-2.0 许可代码；没有附带 SDK、APK、调试凭据或私有签名文件。应用需要使用者显式指定经过核验的 HTTPS 网页地址，不能将源码归档等同于原生 Android/iOS 已完成验收。

## 可选 Python 工具

GeoPandas 1.1.3、Shapely 2.1.2、NetworkX 3.6.1 为可选 GIS 依赖，未打包 Python 环境或全部传递依赖。三个主包的原许可文本随 third-party/licenses/python-* 保存；安装其他依赖时仍应保留它们各自许可。
