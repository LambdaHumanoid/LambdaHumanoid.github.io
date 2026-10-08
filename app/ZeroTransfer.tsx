"use client";

import { useState } from "react";
import { DemoPlayer } from "./DemoPlayer";
import { ResourceIcon } from "./ResourceIcon";
import type { DemoVideo } from "./research";

function recording(id: string, title: string): DemoVideo {
  return { id, title, videoSrc: `/videos/zero-transfer/${id}.mp4`, posterSrc: `/videos/zero-transfer/${id}.jpg`, captionsSrc: null };
}

const navigation = [
  { id: "basket", title: "Basket placement", clips: [
    recording("basket-location-1", "Location 1"),
    recording("basket-location-2", "Location 2"),
    recording("basket-location-3", "Location 3"),
    recording("basket-moving-1", "Moving target 1"),
    recording("basket-moving-2", "Moving target 2"),
  ] },
  { id: "bin", title: "Pedal-bin interaction", clips: [
    recording("bin-location-1", "Location 1"),
    recording("bin-location-2", "Location 2"),
    recording("bin-moving", "Moving target"),
  ] },
];

const manipulation = [
  { id: "close-drawer", title: "Close drawer" },
  { id: "close-laptop", title: "Close laptop" },
  { id: "open-fridge", title: "Open fridge" },
  { id: "pull-curtain", title: "Pull curtain" },
];

const conditions = [
  { id: "human", title: "Human demonstration" },
  { id: "aligned", title: "Aligned execution" },
  { id: "unaligned", title: "Unaligned replay" },
];

function TransferVideo({ video, label, scene }: { video: DemoVideo; label: string; scene: string }) {
  return <figure className="transfer-video">
    <figcaption>{label}</figcaption>
    <div className="demo-media"><DemoPlayer key={video.id} video={video} scene={scene} /></div>
  </figure>;
}

function NavigationExample({ task }: { task: typeof navigation[number] }) {
  const [selected, setSelected] = useState(0);
  const clip = task.clips[selected];
  return <article className="transfer-navigation-task">
    <h4>{task.title}</h4>
    <div className="demo-media"><DemoPlayer key={clip.id} video={clip} scene={`${task.title}: navigation transfer`} /></div>
    <div className="transfer-choices" role="group" aria-label={`${task.title} examples`}>
      {task.clips.map((item, i) => <button key={item.id} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}>{item.title}</button>)}
    </div>
  </article>;
}

export function ZeroTransfer() {
  const [selectedTask, setSelectedTask] = useState(0);
  const [showAlignment, setShowAlignment] = useState(false);
  const task = manipulation[selectedTask];
  return <section className="content-section transfer-section" id="zero-transfer" aria-labelledby="transfer-title">
    <div className="section-intro"><div><p className="section-label">Zero-Shot Transfer on Unitree G1</p><h2 id="transfer-title">Whole-body coordination.<br />Long-range interaction.</h2></div><p>Aligned human task demonstrations support G1 control without target-task robot demonstrations. These evaluations validate the robot-aligned data pipeline across two representative task families.</p></div>
    <section className="transfer-block" aria-labelledby="navigation-transfer-title">
      <div className="transfer-heading"><div className="transfer-heading-row"><h3 id="navigation-transfer-title">Long-Range Loco-Manipulation</h3><a className="transfer-project-link" href="https://lambdahumanoid.github.io/EgoAlign/" target="_blank" rel="noreferrer" aria-label="Visit the EgoAlign project for long-range loco-manipulation">EgoAlign<ResourceIcon kind="external" /></a></div><p>76.2% progress across relocation, navigation, and foot interaction, averaging seen and unseen target locations. Videos also illustrate targets moved during execution.</p></div>
      <div className="transfer-navigation-grid">{navigation.map(item => <NavigationExample key={item.id} task={item} />)}</div>
      <details className="transfer-alignment" onToggle={event => setShowAlignment(event.currentTarget.open)}>
        <summary>Closer look: end-effector alignment</summary>
        {showAlignment && <div className="transfer-comparison-grid">
          {conditions.map(condition => <TransferVideo key={condition.id} video={recording(`basket-${condition.id}`, `Basket grasp: ${condition.title}`)} label={condition.title} scene="End-effector alignment comparison" />)}
        </div>}
      </details>
    </section>
    <section className="transfer-block" aria-labelledby="manipulation-transfer-title">
      <div className="transfer-heading"><div className="transfer-heading-row"><h3 id="manipulation-transfer-title">Whole-Body Loco-Manipulation</h3><a className="transfer-project-link" href="https://opendrivelab.com/EgoHumanoid-V2/" target="_blank" rel="noreferrer" aria-label="Visit the EgoHumanoid-V2 project for whole-body loco-manipulation">EgoHumanoid-V2<ResourceIcon kind="external" /></a></div><p>51.7% progress across four coordinated whole-body tasks. Compare the human demonstration, aligned execution, and unaligned replay.</p></div>
      <div className="transfer-choices transfer-task-choices" role="group" aria-label="Manipulation transfer tasks">
        {manipulation.map((item, i) => <button key={item.id} type="button" aria-pressed={selectedTask === i} onClick={() => setSelectedTask(i)}>{item.title}</button>)}
      </div>
      <div className="transfer-comparison-grid" role="group" aria-label={`${task.title} comparison`}>
        {conditions.map(condition => <TransferVideo key={`${task.id}-${condition.id}`} video={recording(`${task.id}-${condition.id}`, `${task.title}: ${condition.title}`)} label={condition.title} scene="Manipulation transfer" />)}
      </div>
    </section>
  </section>;
}
