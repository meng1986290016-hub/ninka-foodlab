import { AbsoluteFill, Composition, Folder, Still } from "remotion";

import { Cover } from "./Cover";
import { PromoVideo } from "./PromoVideo";
import { PromoVideoLandscape } from "./PromoVideoLandscape";
import { promoSchema } from "./schema";
import { AgentScene } from "./scenes/AgentScene";
import { CtaScene } from "./scenes/CtaScene";
import { IngredientsScene } from "./scenes/IngredientsScene";
import { IntroScene } from "./scenes/IntroScene";
import { LabelScene } from "./scenes/LabelScene";
import { WorkbenchScene } from "./scenes/WorkbenchScene";
import { AgentLandscapeScene } from "./landscape/AgentLandscapeScene";
import { CtaLandscapeScene } from "./landscape/CtaLandscapeScene";
import { IngredientsLandscapeScene } from "./landscape/IngredientsLandscapeScene";
import { IntroLandscapeScene } from "./landscape/IntroLandscapeScene";
import { LabelLandscapeScene } from "./landscape/LabelLandscapeScene";
import { WorkbenchLandscapeScene } from "./landscape/WorkbenchLandscapeScene";
import { BrandBridgeMotionTest } from "./motion-test/BrandBridgeMotionTest";
import { BrandCrescendoScene } from "./motion-test/BrandCrescendoScene";
import { EndCardScene } from "./motion-test/EndCardScene";
import { ProposalBridgeScene } from "./motion-test/ProposalBridgeScene";
import {
  defaultMotionTestProps,
  motionTestSchema,
} from "./motion-test/schema";
import { NinkaFoodLabLaunchStoryboardV02 } from "./launch-v02/NinkaFoodLabLaunchStoryboardV02";
import { Scene01Statement } from "./launch-v02/Scene01Statement";
import { Scene02ProductReveal } from "./launch-v02/Scene02ProductReveal";
import { Scene03Ingredients } from "./launch-v02/Scene03Ingredients";
import { Scene03To04MatchMove } from "./launch-v02/Scene03To04MatchMove";
import { Scene04To05AgentEntry } from "./launch-v02/Scene04To05AgentEntry";
import { Scene04Workbench } from "./launch-v02/Scene04Workbench";
import { Scene05AgentCapabilities } from "./launch-v02/Scene05AgentCapabilities";
import { Scene06AgentProposal } from "./launch-v02/Scene06AgentProposal";
import {
  defaultLaunchV02Props,
  launchV02Schema,
} from "./launch-v02/schema";
import { NinkaFoodLabLaunchStoryboardV03Camera } from "./launch-v03-camera/NinkaFoodLabLaunchStoryboardV03Camera";
import { ReferenceLanguageStyleTest } from "./reference-style-test/ReferenceLanguageStyleTest";
import { Scene01FormulaQuestion } from "./reference-style-test/Scene01FormulaQuestion";
import { Scene02KineticStatement } from "./reference-style-test/Scene02KineticStatement";
import { Scene03BrandReveal } from "./reference-style-test/Scene03BrandReveal";
import { Scene04IngredientProof } from "./reference-style-test/Scene04IngredientProof";
import { IngredientCameraTest02 } from "./reference-style-test/IngredientCameraTest02";
import {
  defaultReferenceStyleTestProps,
  referenceStyleTestSchema,
} from "./reference-style-test/schema";
import { Segment01Opening } from "./segment-01-opening/Segment01Opening";
import {
  defaultSegment01OpeningProps,
  segment01OpeningSchema,
} from "./segment-01-opening/schema";
import { Segment02ProductReveal } from "./segment-02-product-reveal/Segment02ProductReveal";
import { segment02ProductRevealSchema } from "./segment-02-product-reveal/schema";
import { CombinedFirstThree } from "./combined-first-three/CombinedFirstThree";
import { combinedFirstThreeSchema } from "./combined-first-three/schema";
import { Segment04WorkbenchRecalculation } from "./segment-04-workbench-recalculation/Segment04WorkbenchRecalculation";
import { Segment04WorkbenchRecalculationV02 } from "./segment-04-workbench-recalculation/Segment04WorkbenchRecalculationV02";
import { segment04WorkbenchRecalculationSchema } from "./segment-04-workbench-recalculation/schema";
import { Segment05AgentCapabilities } from "./segment-05-agent-capabilities/Segment05AgentCapabilities";
import { segment05AgentCapabilitiesSchema } from "./segment-05-agent-capabilities/schema";
import { CombinedCurrentThroughAgent } from "./combined-current-through-agent/CombinedCurrentThroughAgent";
import { combinedCurrentThroughAgentSchema } from "./combined-current-through-agent/schema";
import { Segment06AgentProposal } from "./segment-06-agent-proposal/Segment06AgentProposal";
import { segment06AgentProposalSchema } from "./segment-06-agent-proposal/schema";
import { Segment07BrandBridge } from "./segment-07-brand-bridge/Segment07BrandBridge";
import { segment07BrandBridgeSchema } from "./segment-07-brand-bridge/schema";
import { Segment08BrandReveal } from "./segment-08-brand-reveal/Segment08BrandReveal";
import { segment08BrandRevealSchema } from "./segment-08-brand-reveal/schema";
import { Segment09EndCard } from "./segment-09-end-card/Segment09EndCard";
import { segment09EndCardSchema } from "./segment-09-end-card/schema";
import { NinkaFoodLabFullAssemblyV01 } from "./full-assembly/NinkaFoodLabFullAssemblyV01";
import { fullAssemblySchema } from "./full-assembly/schema";

const defaultProps = {
  cta: "GitHub 搜索 Ninka FoodLab",
  repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab",
  demoBadge: "演示数据",
  musicFile: "",
  musicVolume: 0.72,
};

function PromoVideo2K(props: typeof defaultProps) {
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "relative",
          width: 1080,
          height: 1920,
          transform: "scale(1.3333333333333333)",
          transformOrigin: "top left",
        }}
      >
        <PromoVideo {...props} />
      </div>
    </AbsoluteFill>
  );
}

export function RemotionRoot() {
  return (
    <>
      <Folder name="Ninka-FoodLab-Promo-Scenes">
        <Composition id="Promo-01-Intro" component={IntroScene} durationInFrames={75} fps={30} width={1080} height={1920} schema={promoSchema} defaultProps={{ cta: "GitHub 搜索 Ninka FoodLab", repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab", demoBadge: "演示数据", musicFile: "", musicVolume: 0.72 }} />
        <Composition id="Promo-02-Ingredients" component={IngredientsScene} durationInFrames={210} fps={30} width={1080} height={1920} schema={promoSchema} defaultProps={{ cta: "GitHub 搜索 Ninka FoodLab", repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab", demoBadge: "演示数据", musicFile: "", musicVolume: 0.72 }} />
        <Composition id="Promo-03-Agent" component={AgentScene} durationInFrames={600} fps={30} width={1080} height={1920} schema={promoSchema} defaultProps={{ cta: "GitHub 搜索 Ninka FoodLab", repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab", demoBadge: "演示数据", musicFile: "", musicVolume: 0.72 }} />
        <Composition id="Promo-04-Workbench" component={WorkbenchScene} durationInFrames={270} fps={30} width={1080} height={1920} schema={promoSchema} defaultProps={{ cta: "GitHub 搜索 Ninka FoodLab", repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab", demoBadge: "演示数据", musicFile: "", musicVolume: 0.72 }} />
        <Composition id="Promo-05-Label" component={LabelScene} durationInFrames={120} fps={30} width={1080} height={1920} schema={promoSchema} defaultProps={{ cta: "GitHub 搜索 Ninka FoodLab", repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab", demoBadge: "演示数据", musicFile: "", musicVolume: 0.72 }} />
        <Composition id="Promo-06-CTA" component={CtaScene} durationInFrames={75} fps={30} width={1080} height={1920} schema={promoSchema} defaultProps={{ cta: "GitHub 搜索 Ninka FoodLab", repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab", demoBadge: "演示数据", musicFile: "", musicVolume: 0.72 }} />
      </Folder>
      <Folder name="Ninka-FoodLab-Promo-Landscape-Scenes">
        <Composition id="Landscape-01-Intro" component={IntroLandscapeScene} durationInFrames={75} fps={30} width={2560} height={1440} schema={promoSchema} defaultProps={defaultProps} />
        <Composition id="Landscape-02-Ingredients" component={IngredientsLandscapeScene} durationInFrames={210} fps={30} width={2560} height={1440} schema={promoSchema} defaultProps={defaultProps} />
        <Composition id="Landscape-03-Agent" component={AgentLandscapeScene} durationInFrames={600} fps={30} width={2560} height={1440} schema={promoSchema} defaultProps={defaultProps} />
        <Composition id="Landscape-04-Workbench" component={WorkbenchLandscapeScene} durationInFrames={270} fps={30} width={2560} height={1440} schema={promoSchema} defaultProps={defaultProps} />
        <Composition id="Landscape-05-Label" component={LabelLandscapeScene} durationInFrames={120} fps={30} width={2560} height={1440} schema={promoSchema} defaultProps={defaultProps} />
        <Composition id="Landscape-06-CTA" component={CtaLandscapeScene} durationInFrames={75} fps={30} width={2560} height={1440} schema={promoSchema} defaultProps={defaultProps} />
      </Folder>
      <Folder name="Ninka-FoodLab-Launch-Motion-Test-Scenes">
        <Composition
          id="MotionTest-06-07-Proposal-BrandBridge"
          component={ProposalBridgeScene}
          durationInFrames={69}
          fps={30}
          width={2560}
          height={1440}
          schema={motionTestSchema}
          defaultProps={defaultMotionTestProps}
        />
        <Composition
          id="MotionTest-08-BrandCrescendo"
          component={BrandCrescendoScene}
          durationInFrames={96}
          fps={30}
          width={2560}
          height={1440}
          schema={motionTestSchema}
          defaultProps={defaultMotionTestProps}
        />
        <Composition
          id="MotionTest-09-EndCard"
          component={EndCardScene}
          durationInFrames={102}
          fps={30}
          width={2560}
          height={1440}
          schema={motionTestSchema}
          defaultProps={defaultMotionTestProps}
        />
      </Folder>
      <Composition
        id="NinkaFoodLabBrandBridgeMotionTest"
        component={BrandBridgeMotionTest}
        durationInFrames={267}
        fps={30}
        width={2560}
        height={1440}
        schema={motionTestSchema}
        defaultProps={defaultMotionTestProps}
      />
      <Folder name="Ninka-FoodLab-Launch-Storyboard-V02-Scenes">
        <Composition id="LaunchV02-01-Statement" component={Scene01Statement} durationInFrames={90} fps={30} width={2560} height={1440} schema={launchV02Schema} defaultProps={defaultLaunchV02Props} />
        <Composition id="LaunchV02-02-ProductReveal" component={Scene02ProductReveal} durationInFrames={84} fps={30} width={2560} height={1440} schema={launchV02Schema} defaultProps={defaultLaunchV02Props} />
        <Composition id="LaunchV02-03-Ingredients" component={Scene03Ingredients} durationInFrames={150} fps={30} width={2560} height={1440} schema={launchV02Schema} defaultProps={defaultLaunchV02Props} />
        <Composition id="LaunchV02-03-04-CocoaMatchMove" component={Scene03To04MatchMove} durationInFrames={24} fps={30} width={2560} height={1440} schema={launchV02Schema} defaultProps={defaultLaunchV02Props} />
        <Composition id="LaunchV02-04-Workbench" component={Scene04Workbench} durationInFrames={168} fps={30} width={2560} height={1440} schema={launchV02Schema} defaultProps={defaultLaunchV02Props} />
        <Composition id="LaunchV02-04-05-AgentEntry" component={Scene04To05AgentEntry} durationInFrames={24} fps={30} width={2560} height={1440} schema={launchV02Schema} defaultProps={defaultLaunchV02Props} />
        <Composition id="LaunchV02-05-AgentCapabilities" component={Scene05AgentCapabilities} durationInFrames={210} fps={30} width={2560} height={1440} schema={launchV02Schema} defaultProps={defaultLaunchV02Props} />
        <Composition id="LaunchV02-06-AgentProposalLead" component={Scene06AgentProposal} durationInFrames={195} fps={30} width={2560} height={1440} schema={launchV02Schema} defaultProps={defaultLaunchV02Props} />
      </Folder>
      <Composition
        id="NinkaFoodLabLaunchStoryboardV02"
        component={NinkaFoodLabLaunchStoryboardV02}
        durationInFrames={1212}
        fps={30}
        width={2560}
        height={1440}
        schema={launchV02Schema}
        defaultProps={defaultLaunchV02Props}
      />
      <Composition
        id="NinkaFoodLabLaunchStoryboardV03Camera"
        component={NinkaFoodLabLaunchStoryboardV03Camera}
        durationInFrames={1212}
        fps={30}
        width={2560}
        height={1440}
        schema={launchV02Schema}
        defaultProps={{
          ...defaultLaunchV02Props,
          showReviewLabel: false,
        }}
      />
      <Folder name="Ninka-FoodLab-Reference-Language-Style-Test-01-Scenes">
        <Composition id="StyleTest01-01-FormulaQuestion" component={Scene01FormulaQuestion} durationInFrames={72} fps={30} width={2560} height={1440} schema={referenceStyleTestSchema} defaultProps={defaultReferenceStyleTestProps} />
        <Composition id="StyleTest01-02-KineticStatement" component={Scene02KineticStatement} durationInFrames={96} fps={30} width={2560} height={1440} schema={referenceStyleTestSchema} defaultProps={defaultReferenceStyleTestProps} />
        <Composition id="StyleTest01-03-BrandReveal" component={Scene03BrandReveal} durationInFrames={84} fps={30} width={2560} height={1440} schema={referenceStyleTestSchema} defaultProps={defaultReferenceStyleTestProps} />
        <Composition id="StyleTest01-04-IngredientProof" component={Scene04IngredientProof} durationInFrames={123} fps={30} width={2560} height={1440} schema={referenceStyleTestSchema} defaultProps={defaultReferenceStyleTestProps} />
      </Folder>
      <Composition
        id="NinkaFoodLabReferenceLanguageStyleTest01"
        component={ReferenceLanguageStyleTest}
        durationInFrames={375}
        fps={30}
        width={2560}
        height={1440}
        schema={referenceStyleTestSchema}
        defaultProps={{
          question: "还在用表格管理配方和原料吗？",
          productLine: "食品研发的本地工作台",
          ingredientName: "可可粉",
          ingredientSpec: "低脂可可粉 CP-10",
          reviewLabel: "STYLE TEST · 参考语言验证",
          showReviewLabel: true,
          bedVolume: 0.34,
          sfxVolume: 0.72,
        }}
      />
      <Composition
        id="NinkaFoodLabIngredientCameraTest02"
        component={IngredientCameraTest02}
        durationInFrames={150}
        fps={30}
        width={2560}
        height={1440}
        schema={referenceStyleTestSchema}
        defaultProps={{
          question: "还在用表格管理配方和原料吗？",
          productLine: "食品研发的本地工作台",
          ingredientName: "可可粉",
          ingredientSpec: "低脂可可粉 CP-10",
          reviewLabel: "UI CAMERA TEST 02 · 运镜校准",
          showReviewLabel: false,
          bedVolume: 0.34,
          sfxVolume: 0.72,
        }}
      />
      <Composition
        id="NinkaFoodLabSegment01OpeningV01"
        component={Segment01Opening}
        durationInFrames={105}
        fps={30}
        width={2560}
        height={1440}
        schema={segment01OpeningSchema}
        defaultProps={defaultSegment01OpeningProps}
      />
      <Composition
        id="NinkaFoodLabSegment02ProductRevealV01"
        component={Segment02ProductReveal}
        durationInFrames={132}
        fps={30}
        width={2560}
        height={1440}
        schema={segment02ProductRevealSchema}
        defaultProps={{
          positioning: "食品研发的本地工作台",
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabCombinedFirstThreeV01"
        component={CombinedFirstThree}
        durationInFrames={351}
        fps={30}
        width={2560}
        height={1440}
        schema={combinedFirstThreeSchema}
        defaultProps={{
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabSegment04WorkbenchRecalculationV01"
        component={Segment04WorkbenchRecalculation}
        durationInFrames={192}
        fps={30}
        width={2560}
        height={1440}
        schema={segment04WorkbenchRecalculationSchema}
        defaultProps={{
          recalcStatement: "改一处，整份配方一起复算。",
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabSegment04WorkbenchRecalculationV02"
        component={Segment04WorkbenchRecalculationV02}
        durationInFrames={228}
        fps={30}
        width={2560}
        height={1440}
        schema={segment04WorkbenchRecalculationSchema}
        defaultProps={{
          recalcStatement: "改一处，整份配方一起复算。",
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabSegment05AgentCapabilitiesV01"
        component={Segment05AgentCapabilities}
        durationInFrames={252}
        fps={30}
        width={2560}
        height={1440}
        schema={segment05AgentCapabilitiesSchema}
        defaultProps={{
          question: "你能帮我干些什么？",
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabCurrentAssemblyThroughAgentV01"
        component={CombinedCurrentThroughAgent}
        durationInFrames={831}
        fps={30}
        width={2560}
        height={1440}
        schema={combinedCurrentThroughAgentSchema}
        defaultProps={{
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabSegment06AgentProposalV01"
        component={Segment06AgentProposal}
        durationInFrames={213}
        fps={30}
        width={2560}
        height={1440}
        schema={segment06AgentProposalSchema}
        defaultProps={{
          formulaPrompt:
            "请根据原料库里的现有原料，帮我生成一份低糖方向的可可饮品配方提案。",
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabSegment07BrandBridgeV01"
        component={Segment07BrandBridge}
        durationInFrames={90}
        fps={30}
        width={2560}
        height={1440}
        schema={segment07BrandBridgeSchema}
        defaultProps={{
          formulaPrompt:
            "请根据原料库里的现有原料，帮我生成一份低糖方向的可可饮品配方提案。",
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabSegment08BrandRevealV01"
        component={Segment08BrandReveal}
        durationInFrames={96}
        fps={30}
        width={2560}
        height={1440}
        schema={segment08BrandRevealSchema}
        defaultProps={{
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabSegment09EndCardV01"
        component={Segment09EndCard}
        durationInFrames={108}
        fps={30}
        width={2560}
        height={1440}
        schema={segment09EndCardSchema}
        defaultProps={{
          tagline: "食品研发的本地工作台",
          repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab",
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabFullAssemblyV01"
        component={NinkaFoodLabFullAssemblyV01}
        durationInFrames={1338}
        fps={30}
        width={2560}
        height={1440}
        schema={fullAssemblySchema}
        defaultProps={{
          bedVolume: 0.22,
          sfxVolume: 0.62,
        }}
      />
      <Composition
        id="NinkaFoodLabPromo"
        component={PromoVideo}
        durationInFrames={1350}
        fps={30}
        width={1080}
        height={1920}
        schema={promoSchema}
        defaultProps={{
          cta: "GitHub 搜索 Ninka FoodLab",
          repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab",
          demoBadge: "演示数据",
          musicFile: "",
          musicVolume: 0.72,
        }}
      />
      <Composition
        id="NinkaFoodLabPromo2K"
        component={PromoVideo2K}
        durationInFrames={1350}
        fps={30}
        width={1440}
        height={2560}
        schema={promoSchema}
        defaultProps={defaultProps}
      />
      <Composition
        id="NinkaFoodLabPromoLandscape"
        component={PromoVideoLandscape}
        durationInFrames={1350}
        fps={30}
        width={2560}
        height={1440}
        schema={promoSchema}
        defaultProps={defaultProps}
      />
      <Still
        id="NinkaFoodLabCover"
        component={Cover}
        width={1242}
        height={1660}
        schema={promoSchema}
        defaultProps={{
          cta: "GitHub 搜索 Ninka FoodLab",
          repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab",
          demoBadge: "演示数据",
          musicFile: "",
          musicVolume: 0.72,
        }}
      />
    </>
  );
}
