export type Point = { x: number; y: number };

export type DeskLayout = Point & {
  id: `desk-${string}`;
  label: string;
  width: number;
  height: number;
  seat: Point;
};

export type OfficeLayout = {
  name: "desktop" | "mobile";
  viewBox: string;
  bounds: { x: number; y: number; width: number; height: number };
  workZone: { x: number; y: number; width: number; height: number };
  desks: DeskLayout[];
  spots: {
    cooler: Point;
    tennis: [Point, Point];
    wc: Point;
    entrance: Point;
  };
  tennisTable: Point & { width: number; height: number };
  wcRoom: Point & { width: number; height: number };
  plants: [Point, Point, Point, Point];
  /** Where an idle agent stands when it visits a spot (beside the object, never on top of it). */
  visits: Record<IdleSpot, Point>;
};

export type IdleSpot = "cooler" | "tennis" | "wc" | "plant";
export const IDLE_SPOTS: IdleSpot[] = ["cooler", "tennis", "wc", "plant"];

export const desktopOfficeLayout: OfficeLayout = {
  name: "desktop",
  viewBox: "0 0 1200 720",
  bounds: { x: 20, y: 20, width: 1160, height: 680 },
  workZone: { x: 55, y: 74, width: 690, height: 556 },
  desks: [
    { id: "desk-01", label: "01", x: 94, y: 148, width: 220, height: 84, seat: { x: 204, y: 264 } },
    { id: "desk-02", label: "02", x: 390, y: 148, width: 220, height: 84, seat: { x: 500, y: 264 } },
    { id: "desk-03", label: "03", x: 94, y: 390, width: 220, height: 84, seat: { x: 204, y: 506 } },
    { id: "desk-04", label: "04", x: 390, y: 390, width: 220, height: 84, seat: { x: 500, y: 506 } },
  ],
  spots: {
    cooler: { x: 790, y: 92 },
    tennis: [{ x: 842, y: 458 }, { x: 1110, y: 458 }],
    wc: { x: 1060, y: 180 },
    entrance: { x: 590, y: 700 },
  },
  tennisTable: { x: 800, y: 378, width: 330, height: 164 },
  wcRoom: { x: 958, y: 62, width: 190, height: 236 },
  plants: [{ x: 690, y: 140 }, { x: 720, y: 600 }, { x: 788, y: 305 }, { x: 1140, y: 628 }],
  visits: { cooler: { x: 760, y: 200 }, tennis: { x: 770, y: 460 }, wc: { x: 1050, y: 200 }, plant: { x: 850, y: 320 } },
};

export const mobileOfficeLayout: OfficeLayout = {
  name: "mobile",
  viewBox: "0 0 600 1100",
  bounds: { x: 18, y: 18, width: 564, height: 1064 },
  workZone: { x: 35, y: 58, width: 530, height: 470 },
  desks: [
    { id: "desk-01", label: "01", x: 58, y: 126, width: 210, height: 84, seat: { x: 163, y: 239 } },
    { id: "desk-02", label: "02", x: 332, y: 126, width: 210, height: 84, seat: { x: 437, y: 239 } },
    { id: "desk-03", label: "03", x: 58, y: 333, width: 210, height: 84, seat: { x: 163, y: 446 } },
    { id: "desk-04", label: "04", x: 332, y: 333, width: 210, height: 84, seat: { x: 437, y: 446 } },
  ],
  spots: {
    cooler: { x: 74, y: 590 },
    tennis: [{ x: 296, y: 677 }, { x: 540, y: 677 }],
    wc: { x: 464, y: 896 },
    entrance: { x: 300, y: 1082 },
  },
  tennisTable: { x: 270, y: 610, width: 280, height: 142 },
  wcRoom: { x: 348, y: 805, width: 202, height: 210 },
  plants: [{ x: 55, y: 552 }, { x: 548, y: 560 }, { x: 72, y: 950 }, { x: 310, y: 978 }],
  visits: { cooler: { x: 225, y: 560 }, tennis: { x: 240, y: 700 }, wc: { x: 450, y: 930 }, plant: { x: 140, y: 945 } },
};
