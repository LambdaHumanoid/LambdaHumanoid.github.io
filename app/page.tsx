import { DemoPlayer } from "./DemoPlayer";
import { AmbientWaves } from "./AmbientWaves";
import { ScalingAnimation } from "./ScalingAnimation";
import { LambdaMark } from "./LambdaMark";
import { HeroMotion } from "./HeroMotion";
import { PageTransitions } from "./PageTransitions";
import { ablations, demoScenes, results, type DemoVideo } from "./research";

const stages = [
  { number: "I", title: "Learn interaction", text: "Pretrain on seven egocentric human datasets to learn object interaction and articulated hand motion across diverse activities.", detail: "Egocentric interaction pretraining", color: "lavender" },
  { number: "II", title: "Learn coordination", text: "Mid-train on HumanVerse-500 to connect locomotion, posture, and hand motion. Paired human and robot-compatible views share the same observations.", detail: "Whole-body human mid-training", color: "purple" },
  { number: "III", title: "Ground in the robot", text: "Post-train with task-aligned human and native robot demonstrations, grounding shared representations in executable humanoid actions.", detail: "Embodiment post-training", color: "orange" },
];

function PaperFigure({ name, alt, caption, width, height }: { name: string; alt: string; caption: string; width: number; height: number }) {
  return (
    <figure className="paper-figure">
      <a href={`/figures/${name}.webp`} target="_blank" rel="noreferrer" aria-label={`Open full-size figure: ${alt}`}>
        {/* Static, pre-compressed paper figures; preserve their native proportions. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/figures/${name}.webp`} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
      </a>
      <figcaption>{caption}<span>Open figure ↗</span></figcaption>
    </figure>
  );
}

function Demo({ video, scene, index }: { video: DemoVideo; scene: string; index: number }) {
  return (
    <article className="demo-video" id={video.id}>
      <div className="demo-media">
        {video.videoSrc ? <DemoPlayer video={video} scene={scene} /> : (
          <div className="demo-placeholder" aria-label={`${scene}: ${video.title}, video coming soon`}>
            <span className="demo-placeholder-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span>Video coming soon</span>
          </div>
        )}
      </div>
      <h4 className="demo-video-title">{video.title}</h4>
    </article>
  );
}

export default function Home() {
  return (
    <main id="main">
      <AmbientWaves />
      <PageTransitions />
      <a href="#overview" className="skip-link">Skip to research overview</a>
      <header className="site-header">
        <a className="brand lambda" href="#top" aria-label="Lambda zero home"><LambdaMark /></a>
        <nav aria-label="Primary navigation"><a href="#overview">Overview</a><a href="#demos">Demos</a><a href="#data">Data</a><a href="#training">Method</a><a href="#evaluation">Results</a></nav>
        <a className="paper-link" href="/paper.pdf" target="_blank" rel="noreferrer">Paper <span aria-hidden="true">↗</span></a>
      </header>
      <section className="hero" id="top">
        <span className="hero-model-mark" aria-hidden="true"><LambdaMark gradientId="hero-lambda-gradient" /></span>
        <div className="hero-content">
          <h1><span className="sr-only">λ₀: </span><span className="hero-title">Scaling Egocentric Human Data for General Humanoid Control</span></h1>
          <p className="hero-lede">Learning to move and manipulate from human experience. λ₀ transfers egocentric whole-body activity into coordinated locomotion, posture, and dexterous interaction on a humanoid robot.</p>
          <div className="hero-actions"><a className="button primary" href="/paper.pdf" target="_blank" rel="noreferrer">Read the paper <span aria-hidden="true">↗</span></a><a className="button quiet" href="#demos">Explore the tasks <svg className="button-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 5v14m-6-6 6 6 6-6" /></svg></a></div>
        </div>
      </section>
      <section className="thesis" id="overview">
        <p className="section-label">Research overview</p>
        <div className="thesis-grid"><h2><span>Human experience.</span><span>Whole-body intelligence.</span></h2><div><p>Diverse human activities reveal how locomotion, posture, and dexterous hand movements work together across varied scenes, objects, and interaction contexts. Stepping closer, bending to reach, and maintaining balance during contact offer rich, naturally occurring examples of whole-body coordination.</p></div></div>
        <p className="overview-summary"><strong>λ₀ builds on diverse human experience.</strong> <strong className="overview-dataset-name">HumanVerse-500</strong> captures everyday activities through synchronized egocentric vision, body motion, and hand motion, preserving the coordination between locomotion, posture, and dexterous interaction. Our three-stage training recipe learns general whole-body priors from these human activities, then acquires manipulation-specific biases through robot demonstrations.</p>
        <p className="overview-takeaway"><span className="overview-takeaway-label">Core idea:</span> we learn whole-body priors from diverse human data, then manipulation-specific biases from robot demonstrations.</p>
      </section>
      <section className="facts" aria-label="Research at a glance">
        <article><strong>500<span>h</span></strong><span>whole-body human activity</span></article>
        <article><strong>3</strong><span>training stages from interaction to control</span></article>
        <article><strong>4</strong><span>real-world loco-manipulation tasks</span></article>
        <article><strong>80.4<span>%</span></strong><span>average real-world task progress</span></article>
      </section>
      <section className="content-section demos-section" id="demos">
        <div className="section-intro"><div><p className="section-label">Real-world demonstrations</p><h2>Move. Reach. Manipulate.</h2></div><p>Whole-body loco-manipulation across the laboratory, break room, and visitor center.</p></div>
        {demoScenes.filter(scene => scene.videos.some(video => video.videoSrc)).map(scene => (
          <section className="demo-scene" key={scene.id} aria-labelledby={`${scene.id}-heading`}>
            <div className="demo-scene-heading"><h3 id={`${scene.id}-heading`}>{scene.title}</h3></div>
            <div className={`demo-grid demo-grid-${scene.id}`} tabIndex={0} role="region" aria-label={`${scene.title} demonstration videos`}>
              {scene.videos.map((video, index) => <Demo key={video.id} video={video} scene={scene.title} index={index} />)}
            </div>
          </section>
        ))}
        <details className="research-details" open><summary>Robot hardware and evaluation scenes</summary><p>The Unitree G1 uses BrainCo Revo 2 hands and a head-mounted GoPro. PICO body tracking and HexaCercle M11 gloves provide teleoperation demonstrations, with SONIC translating whole-body motion into robot control.</p><PaperFigure name="evaluation" width={2400} height={816} alt="Teleoperation hardware, four real-world task sequences, and evaluation objects" caption="The paper’s hardware setup, task sequences, and robot-seen and robot-unseen objects." /></details>
      </section>
      <section className="content-section data-section" id="data">
        <div className="section-intro"><div><p className="section-label">HumanVerse-500</p><h2>Capture the body.<br />Keep the context.</h2></div><p>500 hours of mobile human activity, collected with portable sensors in everyday spaces. Visual observations stay aligned with whole-body and hand motion.</p></div>
        <PaperFigure name="humanverse" width={3200} height={1247} alt="HumanVerse-500: wearable capture setup, skill frequencies, five-ring activity distribution, and synchronized image–pose examples" caption="HumanVerse-500 spans everyday scenes, objects, and coordinated whole-body activities." />
        <div className="dataset-motion"><HeroMotion /></div>
          <div className="dataset-motion dataset-retargeting"><HeroMotion comparison /></div>
        <div className="modality-columns"><article><h3>Egocentric vision</h3><p>A chest-mounted GoPro records first-person RGB, retaining the objects and surroundings that give actions their context.</p></article><article><h3>24 body joints</h3><p>Wearable PICO tracking captures global displacement, posture, and coordinated body motion on a synchronized timeline.</p></article><article><h3>21 joints per hand</h3><p>Image-based hand reconstruction estimates articulated hand geometry, complementing directly tracked body motion.</p></article></div>
        <div className="data-note"><strong>Separate data for embodiment grounding.</strong><p>An additional 600 task-aligned human demonstrations—150 per task—are reserved for Stage III and excluded from the 500-hour mid-training pool. Sessions are split before temporal windows are constructed.</p></div>
      </section>
      <section className="content-section training-section" id="training">
        <div className="section-intro"><div><p className="section-label">The λ₀ training recipe</p><h2>From interaction priors<br />to humanoid actions.</h2></div><p>A shared vision–language backbone and action expert learn across human and robot data, while embodiment-specific interfaces preserve their different physical meanings.</p></div>
        <div className="pipeline">{stages.map(stage => <article className={`stage-card ${stage.color}`} key={stage.number}><div className="stage-topline"><span>Stage {stage.number}</span><i aria-hidden="true" /></div><h3>{stage.title}</h3><p>{stage.text}</p><span className="stage-detail">{stage.detail}</span></article>)}</div>
        <PaperFigure name="training" width={2400} height={757} alt="Three-stage architecture with Qwen3.5 vision-language backbone, action expert, and human and robot motion interfaces" caption="The shared model learns from human interactions, whole-body motion, and embodiment-specific demonstrations." />
        <div className="deployment-note"><h3>At deployment</h3><p>The policy takes the robot’s camera image, language instruction, and proprioception. It predicts whole-body motion tokens and hand commands; SONIC executes the body motion. Human tracking is used during data collection, not at deployment.</p></div>
      </section>
      <section className="content-section results-section" id="evaluation">
        <div className="section-intro"><div><p className="section-label">Evaluation results</p><h2>Coordinated action.<br />Measurable progress.</h2></div><p>We report both completed tasks and milestone-weighted progress. The two metrics distinguish terminal success from useful partial execution.</p></div>
        <div className="result-highlights"><article><strong>62.5<span>%</span></strong><h3>Real-world success</h3><p>25 of 40 trials completed; +22.5 percentage points over the strongest external baseline.</p></article><article><strong>80.4<span>%</span></strong><h3>Real-world progress</h3><p>Average over four tasks; +25.8 percentage points over the strongest external baseline.</p></article><article><strong>90.0<span>%</span></strong><h3>SIMPLE success</h3><p>Six core tasks, three difficulty levels, 180 trials. Uses the best recorded configuration per task.</p></article></div>
        <div className="comparison-heading"><h3>Real-world comparison</h3><p>Higher is better · four tasks, 40 trials per method</p></div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Real-world results table"><table className="results-table"><caption className="sr-only">Real-world success and task progress</caption><thead><tr><th scope="col">Method</th><th scope="col">Success (%)</th><th scope="col">Task progress (%)</th></tr></thead><tbody>{results.map(row => <tr key={row.name} className={row.name === "λ₀ (Ours)" ? "ours" : undefined}><th scope="row">{row.name}</th>{(["success", "progress"] as const).map(metric => <td key={metric}><div className={`metric-cell ${metric}`}><span className="metric-track" aria-hidden="true"><i style={{ width: `${row[metric]}%` }} /></span><strong>{row[metric].toFixed(1)}</strong></div></td>)}</tr>)}</tbody></table></div>
        <p className="section-note">λ₀ has the highest average success and progress. StarVLA has the highest chair-placement progress (82.5% versus 77.0%).</p>
        <details className="research-details"><summary>Training-stage ablations</summary><p>All variants retain vision–language initialization and Stage III. Removing Stage II causes a larger real-world success drop than removing Stage I.</p><div className="table-scroll" tabIndex={0} role="region" aria-label="Training-stage ablations table"><table className="results-table ablation-table"><caption className="sr-only">Real-world training-stage ablations</caption><thead><tr><th scope="col">Training recipe</th><th scope="col">Success (%)</th><th scope="col">Progress (%)</th></tr></thead><tbody>{ablations.map(row => <tr key={row.name} className={row.name === "Full recipe" ? "ours" : undefined}><th scope="row">{row.name}<small>{row.description}</small></th><td>{row.success.toFixed(1)}</td><td>{row.progress.toFixed(1)}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="content-section scaling-section" id="scaling">
        <div className="section-intro"><div><p className="section-label">Human-data scaling</p><h2>More experience.<br />Lower validation loss.</h2></div><p>With a fixed 2B model and 100k Stage-II updates, nested human-data subsets let us study how data quantity changes learning.</p></div>
        <ScalingAnimation />
        <div className="scaling-findings"><article><h3>Two fixed holdouts</h3><p>From 5% to 100% data, minimum loss decreases by <strong>35.5%</strong> on the representative holdout and <strong>40.6%</strong> on the clean holdout. Both are disjoint from training sessions.</p><p className="section-note">One run per scale. These validation curves do not establish cross-seed reproducibility or improved robot control at every scale.</p></article><article><h3>Downstream task progress</h3><div className="endpoint-comparison"><div><span>No Stage II</span><strong>59.9<small>%</small></strong></div><span className="endpoint-gain">+20.5 pts</span><div><span>Full recipe</span><strong>80.4<small>%</small></strong></div></div><p>The measured real-world endpoints show a gain from Stage II. Evaluations at 5%, 10%, 25%, and 50% are pending, so intermediate-scale trends remain unestablished.</p></article></div>
      </section>
      <section className="closing"><p className="section-label">Explore the research</p><h2>Human motion as a foundation<br />for humanoid control.</h2><p className="closing-copy">Read the full method, evaluation protocols, and experimental findings in the manuscript.</p><a className="button primary" href="/paper.pdf" target="_blank" rel="noreferrer">Read the paper <span aria-hidden="true">↗</span></a></section>
      <footer><a className="footer-brand" href="#top" aria-label="Introducing lambda-0 with HumanVerse-500"><span>Introducing</span><LambdaMark /><span>with HumanVerse-500</span></a><a className="footer-top" href="#top">Back to top ↑</a></footer>
    </main>
  );
}
