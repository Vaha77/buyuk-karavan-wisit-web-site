export type PlannerRoomType="ROOM"|"CORRIDOR";
export type PlannerDoorSide="TOP"|"BOTTOM"|"LEFT"|"RIGHT";
export type PlannerStatus="DRAFT"|"READY";

export type PlannerRoom={
  id:string;name:string;type:PlannerRoomType;x:number;y:number;width:number;length:number;height:number;
  capacityTons:number;temperatureMin:number;temperatureMax:number;doorEnabled:boolean;doorSide:PlannerDoorSide;order:number;
};

export type CalculationDraft={
  id?:string;customerName:string;phone:string;region:string;projectName:string;capacityTons:number;cameraCount:number;
  temperatureMin:number;temperatureMax:number;notes:string;buildingWidth:number;buildingLength:number;buildingHeight:number;
  status:PlannerStatus;rooms:PlannerRoom[];
};

export type CalculationListItem={id:string;customerName:string;projectName:string;seller:string;status:PlannerStatus;updatedAt:string};
