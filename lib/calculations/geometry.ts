import type { PlannerRoom } from "./types";

export const SNAP_METERS=.1;
export const snap=(value:number)=>Number((Math.round(value/SNAP_METERS)*SNAP_METERS).toFixed(1));
export const clamp=(value:number,min:number,max:number)=>Math.min(Math.max(value,min),max);

export function autoPlaceRooms(rooms:PlannerRoom[],buildingWidth:number,buildingLength:number):PlannerRoom[]{
  if(!Number.isFinite(buildingWidth)||!Number.isFinite(buildingLength)||buildingWidth<=0||buildingLength<=0)return rooms;
  let x=0,y=0,rowDepth=0;
  return rooms.map(room=>{
    if(x>0&&x+room.width>buildingWidth+.001){x=0;y=snap(y+rowDepth);rowDepth=0;}
    const placed={...room,x:snap(x),y:snap(y)};
    x=snap(x+room.width);rowDepth=Math.max(rowDepth,room.length);
    return placed;
  });
}

const overlaps=(a:PlannerRoom,b:PlannerRoom)=>a.x<b.x+b.width-.001&&a.x+a.width>b.x+.001&&a.y<b.y+b.length-.001&&a.y+a.length>b.y+.001;
export function geometryWarnings(rooms:PlannerRoom[],buildingWidth:number,buildingLength:number){
  const outside=rooms.some(room=>room.x<0||room.y<0||room.x+room.width>buildingWidth+.001||room.y+room.length>buildingLength+.001);
  let overlap=false;
  for(let i=0;i<rooms.length&&!overlap;i++)for(let j=i+1;j<rooms.length;j++)if(overlaps(rooms[i],rooms[j])){overlap=true;break;}
  return{outside,overlap};
}
