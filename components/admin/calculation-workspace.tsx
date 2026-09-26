/* eslint-disable react/no-unescaped-entities */
"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { saveCalculationAction } from "@/app/admin/(protected)/calculations/actions";
import { CalculationProposalSections } from "@/components/admin/calculation-proposal-sections";
import {
  autoPlaceRooms,
  clamp,
  geometryWarnings,
  snap,
} from "@/lib/calculations/geometry";
import type {
  CalculationDraft,
  PlannerRoom,
  PlannerDoorSide,
  ProductProposalOption,
} from "@/lib/calculations/types";

const conclusion =
  "Ushbu konfiguratsiya kamera hajmi, maqsadli harorat va foydalanish sharoitini hisobga olgan holda mutaxassis tomonidan tanlandi. Maqsad faqat kerakli haroratga erishish emas, balki tizimning barqaror ish rejimini ta’minlashdir.";
const fresh = (exchangeRate: number | null): CalculationDraft => ({
  customerName: "",
  phone: "",
  region: "",
  projectName: "",
  capacityTons: 0,
  cameraCount: 0,
  temperatureMin: -35,
  temperatureMax: 5,
  notes: "",
  buildingWidth: 22,
  buildingLength: 20,
  buildingHeight: 4.2,
  status: "DRAFT",
  rooms: [],
  configurations: [
    {
      id: crypto.randomUUID(),
      type: "RECOMMENDED",
      label: "Mutaxassis tavsiyasi",
      compressor: "",
      compressorNote: "",
      condenser: "",
      condenserNote: "",
      evaporator: "",
      evaporatorNote: "",
      refrigerant: "",
      electricalPanel: "",
      trv: "",
      copperPipe: "",
      fittings: "",
      freon: "",
      installationAccessories: "",
      includedEquipment: "",
      priceUsd: null,
      powerKw: null,
      operatingHoursPerDay: null,
      order: 0,
    },
  ],
  lineItems: [],
  electricityTariff: null,
  specialistConclusion: conclusion,
  proposalNumber: "",
  proposalDate: new Date().toISOString().slice(0, 10),
  validityDays: 15,
  paymentTerms: "",
  deliveryTerms: "",
  installationIncluded: null,
  transportIncluded: null,
  commissioningIncluded: null,
  warranty: "",
  commercialNotes: "",
  discountPercent: null,
  exchangeRate,
});
const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function NumberField({
  label,
  value,
  onChange,
  min = -100,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="calculation-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(numberValue(event.target.value))}
      />
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="calculation-field">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DoorMarker({ room }: { room: PlannerRoom }) {
  if (!room.doorEnabled) return null;
  const gap = Math.min(room.width, room.length) * 0.28;
  switch (room.doorSide) {
    case "TOP":
      return (
        <line
          className="calc-door"
          x1={room.x + room.width / 2 - gap / 2}
          x2={room.x + room.width / 2 + gap / 2}
          y1={room.y}
          y2={room.y}
        />
      );
    case "LEFT":
      return (
        <line
          className="calc-door"
          x1={room.x}
          x2={room.x}
          y1={room.y + room.length / 2 - gap / 2}
          y2={room.y + room.length / 2 + gap / 2}
        />
      );
    case "RIGHT":
      return (
        <line
          className="calc-door"
          x1={room.x + room.width}
          x2={room.x + room.width}
          y1={room.y + room.length / 2 - gap / 2}
          y2={room.y + room.length / 2 + gap / 2}
        />
      );
    default:
      return (
        <line
          className="calc-door"
          x1={room.x + room.width / 2 - gap / 2}
          x2={room.x + room.width / 2 + gap / 2}
          y1={room.y + room.length}
          y2={room.y + room.length}
        />
      );
  }
}

function PlannerSvg({
  draft,
  selected,
  onSelect,
  onMove,
  zoom,
}: {
  draft: CalculationDraft;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  zoom: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null),
    drag = useRef<{ id: string; dx: number; dy: number } | null>(null),
    margin = 2;
  const point = (event: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    return p.matrixTransform(svg.getScreenCTM()?.inverse());
  };
  const down = (event: React.PointerEvent, room: PlannerRoom) => {
    event.preventDefault();
    const p = point(event);
    drag.current = { id: room.id, dx: p.x - room.x, dy: p.y - room.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(room.id);
  };
  const move = (event: React.PointerEvent) => {
    if (!drag.current) return;
    const room = draft.rooms.find((item) => item.id === drag.current?.id);
    if (!room) return;
    const p = point(event);
    onMove(
      room.id,
      snap(
        clamp(
          p.x - drag.current.dx,
          0,
          Math.max(0, draft.buildingWidth - room.width),
        ),
      ),
      snap(
        clamp(
          p.y - drag.current.dy,
          0,
          Math.max(0, draft.buildingLength - room.length),
        ),
      ),
    );
  };
  const end = () => {
    drag.current = null;
  };
  return (
    <div className="calculation-plan-viewport">
      <svg
        ref={svgRef}
        className="calculation-plan-svg"
        style={{ width: `${zoom * 100}%` }}
        viewBox={`${-margin} ${-margin} ${draft.buildingWidth + margin * 2} ${draft.buildingLength + margin * 2}`}
        role="img"
        aria-label="Sovutish kameralarining 2D chizmasi"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <defs>
          <pattern
            id="planner-grid"
            width="1"
            height="1"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 1 0 L 0 0 0 1"
              fill="none"
              stroke="#b9d4ed"
              strokeWidth=".025"
            />
          </pattern>
        </defs>
        <rect
          className="calc-building"
          x="0"
          y="0"
          width={draft.buildingWidth}
          height={draft.buildingLength}
        />
        <rect
          className="calc-grid"
          x="0"
          y="0"
          width={draft.buildingWidth}
          height={draft.buildingLength}
        />
        <line
          className="calc-dimension"
          x1="0"
          x2={draft.buildingWidth}
          y1="-1"
          y2="-1"
        />
        <text
          className="calc-dimension-text"
          x={draft.buildingWidth / 2}
          y="-1.25"
        >
          {draft.buildingWidth} m
        </text>
        <line
          className="calc-dimension"
          x1="-1"
          x2="-1"
          y1="0"
          y2={draft.buildingLength}
        />
        <text
          className="calc-dimension-text"
          x="-1.25"
          y={draft.buildingLength / 2}
          transform={`rotate(-90 -1.25 ${draft.buildingLength / 2})`}
        >
          {draft.buildingLength} m
        </text>
        {draft.rooms.map((room) => {
          const font = Math.max(
              0.42,
              Math.min(0.72, Math.min(room.width, room.length) / 7),
            ),
            volume =
              room.width * room.length * (room.height || draft.buildingHeight);
          return (
            <g
              className={`calc-room is-${room.type.toLowerCase()}${selected === room.id ? " is-selected" : ""}`}
              key={room.id}
              onPointerDown={(event) => down(event, room)}
            >
              <rect
                x={room.x}
                y={room.y}
                width={room.width}
                height={room.length}
              />
              <DoorMarker room={room} />
              <text
                x={room.x + room.width / 2}
                y={room.y + room.length / 2 - font * 1.5}
                style={{ fontSize: font }}
              >
                <tspan
                  x={room.x + room.width / 2}
                  dy="0"
                  className="calc-room-name"
                >
                  {room.name}
                </tspan>
                {room.type === "ROOM" && (
                  <>
                    <tspan x={room.x + room.width / 2} dy={font * 1.25}>
                      {volume.toFixed(0)} m³
                    </tspan>
                    <tspan x={room.x + room.width / 2} dy={font * 1.25}>
                      {room.capacityTons} tonna
                    </tspan>
                    <tspan x={room.x + room.width / 2} dy={font * 1.25}>
                      {room.temperatureMax} / {room.temperatureMin}°C
                    </tspan>
                  </>
                )}
              </text>
              <text
                className="calc-room-measure"
                x={room.x + room.width / 2}
                y={room.y + 0.35}
              >
                {room.width} m
              </text>
              <text
                className="calc-room-measure"
                x={room.x + 0.2}
                y={room.y + room.length / 2}
                transform={`rotate(-90 ${room.x + 0.2} ${room.y + room.length / 2})`}
              >
                {room.length} m
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RoomEditor({
  room,
  buildingHeight,
  onChange,
  onDelete,
  onDuplicate,
}: {
  room: PlannerRoom;
  buildingHeight: number;
  onChange: (next: PlannerRoom) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const set = <K extends keyof PlannerRoom>(key: K, value: PlannerRoom[K]) =>
    onChange({ ...room, [key]: value });
  return (
    <article className={`calculation-room-card is-${room.type.toLowerCase()}`}>
      <div className="calculation-room-heading">
        <strong>{room.type === "ROOM" ? "Kamera" : "Yo'lak"}</strong>
        <div>
          <button type="button" onClick={onDuplicate} aria-label="Nusxalash">
            <Copy size={15} />
          </button>
          <button type="button" onClick={onDelete} aria-label="O'chirish">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="calculation-room-grid">
        <TextField
          label="Nomi"
          value={room.name}
          onChange={(value) => set("name", value)}
        />
        <NumberField
          label="Eni (m)"
          value={room.width}
          min={0.1}
          onChange={(value) => set("width", value)}
        />
        <NumberField
          label="Uzunligi (m)"
          value={room.length}
          min={0.1}
          onChange={(value) => set("length", value)}
        />
        {room.type === "ROOM" && (
          <>
            <NumberField
              label="Balandligi (m)"
              value={room.height || buildingHeight}
              min={0.1}
              onChange={(value) => set("height", value)}
            />
            <NumberField
              label="Sig'imi (tonna)"
              value={room.capacityTons}
              min={0}
              onChange={(value) => set("capacityTons", value)}
            />
            <NumberField
              label="Harorat MIN"
              value={room.temperatureMin}
              onChange={(value) => set("temperatureMin", value)}
            />
            <NumberField
              label="Harorat MAX"
              value={room.temperatureMax}
              onChange={(value) => set("temperatureMax", value)}
            />
            <label className="calculation-field">
              <span>Eshik</span>
              <select
                value={room.doorEnabled ? "yes" : "no"}
                onChange={(event) =>
                  set("doorEnabled", event.target.value === "yes")
                }
              >
                <option value="no">Yo'q</option>
                <option value="yes">Bor</option>
              </select>
            </label>
            {room.doorEnabled && (
              <label className="calculation-field">
                <span>Joylashuvi</span>
                <select
                  value={room.doorSide}
                  onChange={(event) =>
                    set("doorSide", event.target.value as PlannerDoorSide)
                  }
                >
                  <option value="TOP">Yuqori</option>
                  <option value="BOTTOM">Past</option>
                  <option value="LEFT">Chap</option>
                  <option value="RIGHT">O'ng</option>
                </select>
              </label>
            )}
          </>
        )}
      </div>
      {room.type === "ROOM" && (
        <p className="calculation-volume">
          Hisoblangan hajm:{" "}
          <strong>
            {(room.width * room.length * room.height).toFixed(1)} m³
          </strong>
        </p>
      )}
    </article>
  );
}

export function CalculationWorkspace({
  initial,
  products,
  exchangeRate,
}: {
  initial?: CalculationDraft;
  products: ProductProposalOption[];
  exchangeRate: number | null;
}) {
  const router = useRouter(),
    [draft, setDraft] = useState<CalculationDraft>(() =>
      initial ? { ...initial, exchangeRate } : fresh(exchangeRate),
    ),
    [selected, setSelected] = useState<string | null>(
      initial?.rooms[0]?.id || null,
    ),
    [zoom, setZoom] = useState(1),
    [saving, setSaving] = useState(false),
    [feedback, setFeedback] = useState("");
  const warnings = useMemo(
    () =>
      geometryWarnings(draft.rooms, draft.buildingWidth, draft.buildingLength),
    [draft.rooms, draft.buildingWidth, draft.buildingLength],
  );
  const set = <K extends keyof CalculationDraft>(
    key: K,
    value: CalculationDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const room = (type: "ROOM" | "CORRIDOR"): PlannerRoom => ({
    id: crypto.randomUUID(),
    name:
      type === "ROOM"
        ? `K-${draft.rooms.filter((item) => item.type === "ROOM").length + 1}`
        : "YO'LAK",
    type,
    x: 0,
    y: 0,
    width: type === "ROOM" ? 5.3 : Math.max(2, draft.buildingWidth),
    length: type === "ROOM" ? 12 : 3,
    height: type === "ROOM" ? draft.buildingHeight : 0,
    capacityTons: 0,
    temperatureMin: -20,
    temperatureMax: -5,
    doorEnabled: false,
    doorSide: "BOTTOM",
    order: draft.rooms.length,
  });
  const add = (type: "ROOM" | "CORRIDOR") => {
    const next = [...draft.rooms, room(type)];
    set(
      "rooms",
      autoPlaceRooms(next, draft.buildingWidth, draft.buildingLength).map(
        (item, order) => ({ ...item, order }),
      ),
    );
  };
  const updateRoom = (id: string, next: PlannerRoom) =>
    set(
      "rooms",
      draft.rooms.map((item) => (item.id === id ? next : item)),
    );
  const remove = (id: string) => {
    set(
      "rooms",
      draft.rooms
        .filter((item) => item.id !== id)
        .map((item, order) => ({ ...item, order })),
    );
    if (selected === id) setSelected(null);
  };
  const duplicate = (source: PlannerRoom) => {
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} nusxa`,
      order: draft.rooms.length,
    };
    set(
      "rooms",
      autoPlaceRooms(
        [...draft.rooms, copy],
        draft.buildingWidth,
        draft.buildingLength,
      ).map((item, order) => ({ ...item, order })),
    );
  };
  const auto = () =>
    set(
      "rooms",
      autoPlaceRooms(draft.rooms, draft.buildingWidth, draft.buildingLength),
    );
  const save = async () => {
    if (saving) return;
    if (warnings.outside) {
      setFeedback("Kamera bino chegarasidan tashqariga chiqdi.");
      return;
    }
    if (warnings.overlap) {
      setFeedback("Kameralar bir-birining ustiga tushib qolgan.");
      return;
    }
    setSaving(true);
    setFeedback("");
    const result = await saveCalculationAction(draft.id || null, draft);
    setSaving(false);
    if (result.error) {
      setFeedback(result.error);
      return;
    }
    if (result.id) {
      setDraft((current) => ({
        ...current,
        id: result.id,
        proposalNumber: result.proposalNumber || current.proposalNumber,
      }));
      setFeedback("Taklif saqlandi.");
      router.replace(`/admin/calculations/${result.id}?saved=1`);
      router.refresh();
    }
  };
  return (
    <div className="calculation-workspace">
      <header className="calculation-workspace-header">
        <div>
          <Link href="/admin/calculations">← Hisob-kitoblar</Link>
          <div>
            <h1>
              {initial
                ? initial.projectName || "Hisob-kitob"
                : "Yangi hisob-kitob"}
            </h1>
            <span
              className={`calculation-status is-${draft.status.toLowerCase()}`}
            >
              {draft.status === "DRAFT" ? "Qoralama" : "Tayyor"}
            </span>
          </div>
        </div>
        <button
          className="admin-primary-button"
          type="button"
          disabled={saving}
          onClick={save}
        >
          <Save size={17} />
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </button>
      </header>
      {feedback && (
        <p className="admin-form-feedback" role="status">
          {feedback}
        </p>
      )}
      <div className="calculation-split">
        <div className="calculation-controls">
          <section className="admin-form-card">
            <div className="admin-form-card-heading">
              <h2>Mijoz</h2>
            </div>
            <div className="calculation-form-grid">
              <TextField
                label="Mijoz / kompaniya nomi"
                value={draft.customerName}
                placeholder="Agro Fresh MChJ"
                onChange={(value) => set("customerName", value)}
              />
              <TextField
                label="Telefon"
                value={draft.phone}
                onChange={(value) => set("phone", value)}
              />
              <TextField
                label="Viloyat / shahar"
                value={draft.region}
                placeholder="Namangan viloyati"
                onChange={(value) => set("region", value)}
              />
            </div>
          </section>
          <section className="admin-form-card">
            <div className="admin-form-card-heading">
              <h2>Loyiha</h2>
            </div>
            <div className="calculation-form-grid">
              <TextField
                label="Loyiha nomi"
                value={draft.projectName}
                placeholder="310 tonnalik sovutish majmuasi"
                onChange={(value) => set("projectName", value)}
              />
              <NumberField
                label="Umumiy sig'im (tonna)"
                value={draft.capacityTons}
                min={0}
                onChange={(value) => set("capacityTons", value)}
              />
              <NumberField
                label="Kamera soni"
                value={draft.cameraCount}
                min={0}
                step={1}
                onChange={(value) => set("cameraCount", Math.round(value))}
              />
              <NumberField
                label="Harorat MIN"
                value={draft.temperatureMin}
                onChange={(value) => set("temperatureMin", value)}
              />
              <NumberField
                label="Harorat MAX"
                value={draft.temperatureMax}
                onChange={(value) => set("temperatureMax", value)}
              />
              <label className="calculation-field is-wide">
                <span>Izoh</span>
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </label>
            </div>
          </section>
          <section className="admin-form-card">
            <div className="admin-form-card-heading">
              <h2>Bino o'lchamlari</h2>
            </div>
            <div className="calculation-dimensions">
              <NumberField
                label="Umumiy eni (m)"
                value={draft.buildingWidth}
                min={0.1}
                onChange={(value) => set("buildingWidth", value)}
              />
              <NumberField
                label="Umumiy uzunligi (m)"
                value={draft.buildingLength}
                min={0.1}
                onChange={(value) => set("buildingLength", value)}
              />
              <NumberField
                label="Balandligi (m)"
                value={draft.buildingHeight}
                min={0.1}
                onChange={(value) => set("buildingHeight", value)}
              />
            </div>
            <div className="calculation-add-buttons">
              <button type="button" onClick={() => add("ROOM")}>
                <Plus size={16} />
                Kamera qo'shish
              </button>
              <button type="button" onClick={() => add("CORRIDOR")}>
                <Plus size={16} />
                Yo'lak qo'shish
              </button>
            </div>
          </section>
          <div className="calculation-room-list">
            {draft.rooms.map((item) => (
              <RoomEditor
                key={item.id}
                room={item}
                buildingHeight={draft.buildingHeight}
                onChange={(next) => updateRoom(item.id, next)}
                onDelete={() => remove(item.id)}
                onDuplicate={() => duplicate(item)}
              />
            ))}
          </div>
        </div>
        <aside className="calculation-plan-panel">
          <div className="calculation-plan-heading">
            <div>
              <span>KAMERA CHIZMASI</span>
              <p>O'lchamlar metrda · surish 0.1 m qadam bilan</p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setZoom((value) => clamp(value - 0.2, 0.6, 2))}
                aria-label="Kichraytirish"
              >
                <ZoomOut size={16} />
              </button>
              <b>{Math.round(zoom * 100)}%</b>
              <button
                type="button"
                onClick={() => setZoom((value) => clamp(value + 0.2, 0.6, 2))}
                aria-label="Kattalashtirish"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>
          <div className="calculation-plan-actions">
            <button type="button" onClick={auto}>
              Avtomatik joylashtirish
            </button>
            <button type="button" onClick={auto}>
              <RotateCcw size={15} />
              Joylashuvni tiklash
            </button>
          </div>
          {warnings.overlap && (
            <p className="calculation-warning">
              Kameralar bir-birining ustiga tushib qolgan.
            </p>
          )}
          {warnings.outside && (
            <p className="calculation-warning">
              Kamera bino chegarasidan tashqariga chiqdi.
            </p>
          )}
          <PlannerSvg
            draft={draft}
            selected={selected}
            onSelect={setSelected}
            zoom={zoom}
            onMove={(id, x, y) =>
              set(
                "rooms",
                draft.rooms.map((item) =>
                  item.id === id ? { ...item, x, y } : item,
                ),
              )
            }
          />
          <p className="calculation-plan-help">
            Kamerani tanlang va chizma ichida suring. Surish haqiqiy eni yoki
            uzunligini o'zgartirmaydi.
          </p>
        </aside>
      </div>
      <CalculationProposalSections
        draft={draft}
        setDraft={setDraft}
        products={products}
      />
    </div>
  );
}
