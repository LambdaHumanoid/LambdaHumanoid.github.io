// Measured results: paper tables/real_robot_results.tex, synced 2026-09-24.
// Set the media paths below to publish a demo; null intentionally shows a placeholder.
export type DemoTask = {
  id: string; title: string; instruction: string; milestones: string[];
  success: number; progress: number;
  videoSrc: string | null; posterSrc: string | null; captionsSrc: string | null;
};
export const tasks: DemoTask[] = [
  { id: "toy-storage", title: "Toy storage", instruction: "Pick up the plush toy, carry it to the container, and place it inside.", milestones: ["Approach", "Grasp", "Carry", "Place"], success: 7, progress: 81.0, videoSrc: null, posterSrc: null, captionsSrc: null },
  { id: "box-transport", title: "Box transport", instruction: "Grasp the box with both hands, carry it to the target, and set it down.", milestones: ["Bimanual grasp", "Lift", "Transport", "Release"], success: 7, progress: 84.5, videoSrc: null, posterSrc: null, captionsSrc: null },
  { id: "bottle-disposal", title: "Bottle disposal", instruction: "Pick up the bottle, step on the bin pedal, and drop the bottle inside.", milestones: ["Grasp", "Approach bin", "Step on pedal", "Dispose"], success: 5, progress: 79.0, videoSrc: null, posterSrc: null, captionsSrc: null },
  { id: "chair-placement", title: "Chair placement", instruction: "Align with the chair, push it under the table, then release and stop.", milestones: ["Align", "Bilateral contact", "Push", "Insert"], success: 6, progress: 77.0, videoSrc: null, posterSrc: null, captionsSrc: null },
];
export type DemoVideo = {
  id: string; title: string;
  videoSrc: string | null; posterSrc: string | null; captionsSrc: string | null;
};

// Scene videos are configured independently; no scene-specific scores are inferred.
export const demoScenes: { id: string; title: string; videos: DemoVideo[] }[] = [
  { id: "laboratory", title: "Laboratory", videos: [
    { id: "laboratory-01", title: "Toy storage", videoSrc: "/videos/laboratory/toy-storage.mp4", posterSrc: "/videos/laboratory/toy-storage.jpg", captionsSrc: null },
    { id: "laboratory-02", title: "Box transport", videoSrc: "/videos/laboratory/box-transport.mp4", posterSrc: "/videos/laboratory/box-transport.jpg", captionsSrc: null },
    { id: "laboratory-03", title: "Bottle disposal", videoSrc: "/videos/laboratory/bottle-disposal.mp4?v=b6cd360f21", posterSrc: "/videos/laboratory/bottle-disposal.jpg?v=b6cd360f21", captionsSrc: null },
    { id: "laboratory-04", title: "Chair placement", videoSrc: "/videos/laboratory/chair-placement.mp4", posterSrc: "/videos/laboratory/chair-placement.jpg?v=opening-frame", captionsSrc: null },
  ] },
  { id: "break-room", title: "Break room", videos: [
    { id: "break-room-01", title: "Cart pushing", videoSrc: "/videos/break-room/cart-pushing.mp4", posterSrc: "/videos/break-room/cart-pushing.jpg", captionsSrc: null },
    { id: "break-room-03", title: "Fruit delivery", videoSrc: "/videos/break-room/fruit-delivery.mp4", posterSrc: "/videos/break-room/fruit-delivery.jpg", captionsSrc: null },
    { id: "break-room-02", title: "Takeout bag disposal", videoSrc: "/videos/break-room/takeout-bag-disposal.mp4", posterSrc: "/videos/break-room/takeout-bag-disposal.jpg", captionsSrc: null },
  ] },
  { id: "visitor-center", title: "Visitor center", videos: [
    { id: "visitor-center-01", title: "Table wiping", videoSrc: "/videos/visitor-center/table-wiping.mp4", posterSrc: "/videos/visitor-center/table-wiping.jpg", captionsSrc: null },
    { id: "visitor-center-02", title: "Plant watering", videoSrc: "/videos/visitor-center/plant-watering.mp4", posterSrc: "/videos/visitor-center/plant-watering.jpg", captionsSrc: null },
  ] },
];

export const results = [
  { name: "GR00T N1.6", success: 7.5, progress: 21.3 },
  { name: "Ψ₀", success: 10.0, progress: 31.8 },
  { name: "StarVLA", success: 27.5, progress: 54.6 },
  { name: "π₀.₅", success: 40.0, progress: 54.0 },
  { name: "λ₀ (Ours)", success: 62.5, progress: 80.4 },
];
export const ablations = [
  { name: "w/o human-data pretraining", description: "No Stage I or II", success: 15.0, progress: 54.0 },
  { name: "w/o Stage II mid-training", description: "Stages I + III", success: 22.5, progress: 59.9 },
  { name: "w/o Stage I pretraining", description: "Stages II + III", success: 50.0, progress: 75.9 },
  { name: "Full recipe", description: "Stages I + II + III", success: 62.5, progress: 80.4 },
];
