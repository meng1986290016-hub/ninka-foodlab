# Ninka FoodLab 宣传片

这是独立于桌面应用生产数据的 Remotion 工作区。界面素材从当前源码通过 `PromoDemoApi` 重新生成，只使用合成演示数据，不读取 SQLite、模型密钥或正式业务数据。

## 常用命令

```bash
pnpm promo:capture
pnpm promo:keyframes
pnpm promo:cover
pnpm promo:preview
pnpm promo:motion-test:keyframes
pnpm promo:motion-test
pnpm promo:motion-test:verify
pnpm promo:launch-animatic:keyframes
pnpm promo:launch-animatic
pnpm promo:launch-animatic:verify
pnpm promo:verify
pnpm promo:studio
```

无音乐低清预览输出到 `apps/promo-video/out/ninka-foodlab-promo-silent-preview.mp4`。完整 1080×1920 静音版使用 `pnpm promo:silent`。

小红书 2K 竖屏静音版使用 `pnpm promo:2k`，输出为 1440×2560、H.264 MP4。

16:9 横版使用独立的六场景构图，不是竖版留黑或裁切。先运行 `pnpm promo:landscape:keyframes` 检查 2560×1440 关键帧，再运行 `pnpm promo:landscape` 输出 45 秒横版静音 MP4。

Storyboard v0.2 的品牌桥接动作预演使用独立 Composition `NinkaFoodLabBrandBridgeMotionTest`。它只覆盖第六幕结尾至第九幕，共 267 帧（8.9 秒），不会覆盖既有横版或竖版。修订版关键帧输出到 `out/review-motion-test-v02/`，低清无声预演输出到 `out/ninka-foodlab-brand-bridge-motion-test-v02.mp4`；v01 保留用于比较。

完整九幕无声 Animatic 使用独立 Composition `NinkaFoodLabLaunchStoryboardV02`，为 2560×1440、30 fps、1212 帧（40.4 秒）。关键帧输出到 `out/review-launch-animatic-v01/`，低清预览输出到 `out/ninka-foodlab-launch-animatic-v01.mp4`。它复用已经确认的品牌运动段，但不会覆盖任何既有成片或 Motion Test。

用户提供具有商业使用权的 48kHz 立体声 WAV 或高质量 MP3 后，将文件放到 `apps/promo-video/public/audio/`，再执行：

```bash
PROMO_MUSIC_FILE=audio/your-music.wav pnpm promo:render
```

## 音乐生成提示词

> 45-second instrumental, 120 BPM, 4/4, perceived half-time at 60 BPM. Organic technology mood for a professional food R&D software demo. Warm low pulse, sparse granular clicks, subtle wood, mineral and laboratory textures, restrained modern percussion, clean spacious mix, understated confidence. Gentle progression through six scenes, strongest momentum in the middle Agent section, clean confirmation hit near the end with a short natural tail. No vocals, no lyrics, no recognizable melody, no heavy EDM drop, no cyberpunk neon mood, no trailer brass, no exaggerated corporate uplift.

## 审核边界

- 功能画面必须保留“演示数据”标识。
- 不宣称案例已经达到低糖标准。
- 不使用旧截图、旧录屏或旧片头素材。
- 视频和封面不包含版本号、二维码或真实模型配置。
- 生成、渲染不会提交、推送、上传或发布任何内容。
