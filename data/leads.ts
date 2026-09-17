export type LeadStatus = "new" | "reviewing" | "contacted" | "completed";
export type ConversationMessage = { id: string; role: "madina" | "customer"; text: string };
export type Lead = {
  id: string;
  customerName: string;
  phone: string;
  telegram?: string;
  requestType: string;
  product: string;
  dimensions: string;
  capacity: string;
  temperature: string;
  region: string;
  dateLabel: string;
  dateGroup: "today" | "yesterday" | "week";
  status: LeadStatus;
  isUnread: boolean;
  additional: string;
  summary: string;
  conversation: ConversationMessage[];
  managerNote: string;
};
export const leadStatusLabels: Record<LeadStatus,string> = { new:"Yangi", reviewing:"Ko‘rib chiqilmoqda", contacted:"Bog‘lanildi", completed:"Yakunlandi" };

export const mockLeads: Lead[] = [
  { id:"lead-001",customerName:"Abdulloh Karimov",phone:"+998 90 123 45 67",telegram:"@abdulloh_k",requestType:"Sovutish kamerasi",product:"Olma",dimensions:"12 × 6 × 4 m",capacity:"100 tonna",temperature:"0°C / +2°C",region:"Namangan",dateLabel:"Bugun, 14:32",dateGroup:"today",status:"new",isUnread:true,additional:"Mahsulotni sentabrdan martgacha saqlamoqchi.",summary:"Mijoz Namangan hududida taxminan 100 tonna olma saqlash uchun 12 × 6 × 4 metr sovutish kamerasi qurmoqchi. Kerakli harorat 0°C dan +2°C gacha. Mijoz loyiha narxi va mos uskuna komplekti bo‘yicha maslahat kutmoqda.",managerNote:"",conversation:[
    {id:"a1",role:"madina",text:"Assalomu alaykum! Men Madina, BUYUK KARAVAN AI yordamchisiman. Sizga nima yordam bera olaman?"},
    {id:"a2",role:"customer",text:"Haladilnik kamera qurmoqchiman."},
    {id:"a3",role:"madina",text:"Albatta. Kamera ichida qanday mahsulot saqlamoqchisiz?"},
    {id:"a4",role:"customer",text:"Olma."},
    {id:"a5",role:"madina",text:"Kamera o‘lchami qancha bo‘ladi?"},
    {id:"a6",role:"customer",text:"12 × 6 × 4 metr."},
    {id:"a7",role:"madina",text:"Kerakli haroratni bilasizmi?"},
    {id:"a8",role:"customer",text:"0 dan +2 gradus."},
    {id:"a9",role:"madina",text:"Loyiha qaysi hududda bo‘ladi va siz bilan qanday bog‘lansak bo‘ladi?"},
    {id:"a10",role:"customer",text:"Namanganda. Ismim Abdulloh Karimov, telefonim +998 90 123 45 67."},
    {id:"a11",role:"madina",text:"Rahmat, Abdulloh aka. BUYUK KARAVAN mutaxassisi tez orada siz bilan bog‘lanadi."},
  ]},
  { id:"lead-002",customerName:"Javohir",phone:"+998 91 555 22 11",telegram:"@javohir_a",requestType:"Muzlatish kamerasi",product:"Go‘sht",dimensions:"8 × 5 × 3 m",capacity:"40 tonna",temperature:"−18°C",region:"Andijon",dateLabel:"Bugun, 12:10",dateGroup:"today",status:"contacted",isUnread:false,additional:"Kunlik mahsulot kirim-chiqimi bor.",summary:"Javohir Andijonda 40 tonna go‘sht uchun 8 × 5 × 3 metr muzlatish kamerasi qurmoqchi. Kerakli harorat −18°C. Uskuna va loyiha hisob-kitobi bo‘yicha aloqaga chiqilgan.",managerNote:"Narx taklifi tayyorlanmoqda.",conversation:[{id:"b1",role:"madina",text:"Assalomu alaykum! Sizga qanday sovutish yechimi kerak?"},{id:"b2",role:"customer",text:"Go‘sht uchun muzlatish kamerasi kerak."},{id:"b3",role:"madina",text:"O‘lcham va harorat qanday bo‘lishi kerak?"},{id:"b4",role:"customer",text:"8 × 5 × 3 metr, −18°C. Andijonda quramiz."},{id:"b5",role:"madina",text:"Rahmat. Mutaxassisimiz siz bilan tez orada bog‘lanadi."}] },
  { id:"lead-003",customerName:"Azizbek",phone:"+998 93 777 44 55",requestType:"Shock freezing",product:"Meva",dimensions:"10 × 6 × 4 m",capacity:"60 tonna",temperature:"−35°C",region:"Farg‘ona",dateLabel:"Kecha, 18:40",dateGroup:"yesterday",status:"completed",isUnread:false,additional:"Mavsumiy ishlab chiqarish.",summary:"Azizbek Farg‘onada meva uchun 10 × 6 × 4 metr shok muzlatish tizimini so‘ragan. Maqsadli harorat −35°C. Murojaat yakunlangan.",managerNote:"Loyiha bo‘yicha maslahat berildi.",conversation:[{id:"c1",role:"madina",text:"Sizga qanday sovutish tizimi kerak?"},{id:"c2",role:"customer",text:"Mevani tez muzlatish uchun shock freezing kerak."},{id:"c3",role:"madina",text:"O‘lcham va hududni ayta olasizmi?"},{id:"c4",role:"customer",text:"10 × 6 × 4 metr, Farg‘ona."}] },
  { id:"lead-004",customerName:"Malika Usmonova",phone:"+998 94 321 88 20",telegram:"@malika_u",requestType:"Sovutish kamerasi",product:"Sabzavot",dimensions:"9 × 5 × 3 m",capacity:"35 tonna",temperature:"+2°C / +5°C",region:"Toshkent",dateLabel:"Bugun, 10:06",dateGroup:"today",status:"new",isUnread:true,additional:"Ombor binosi tayyor.",summary:"Malika Usmonova Toshkentdagi ombor uchun 35 tonna sabzavot sig‘imli sovutish kamerasini rejalashtirmoqda. O‘lcham 9 × 5 × 3 metr, harorat +2°C dan +5°C gacha.",managerNote:"",conversation:[{id:"d1",role:"madina",text:"Assalomu alaykum! Qanday mahsulot saqlamoqchisiz?"},{id:"d2",role:"customer",text:"Sabzavot uchun kamera kerak."},{id:"d3",role:"customer",text:"Toshkentda, omborimiz tayyor."}] },
  { id:"lead-005",customerName:"Sardor Raximov",phone:"+998 99 210 33 44",requestType:"Chiller tizimi",product:"Suv",dimensions:"—",capacity:"15 kVt",temperature:"+5°C",region:"Samarqand",dateLabel:"Kecha, 09:15",dateGroup:"yesterday",status:"reviewing",isUnread:false,additional:"Ishlab chiqarish liniyasiga ulash kerak.",summary:"Sardor Samarqanddagi ishlab chiqarish liniyasi uchun 15 kVt chiller tizimini so‘ragan. Sovutilgan suv harorati taxminan +5°C bo‘lishi kerak.",managerNote:"Texnik talablarni aniqlashtirish kerak.",conversation:[{id:"e1",role:"madina",text:"Sizga qanday uskuna kerak?"},{id:"e2",role:"customer",text:"Ishlab chiqarish uchun chiller kerak."},{id:"e3",role:"madina",text:"Qancha quvvat va qaysi harorat kerak?"},{id:"e4",role:"customer",text:"15 kVt, +5°C atrofida."}] },
  { id:"lead-006",customerName:"Dilshod Aliyev",phone:"+998 95 600 71 20",telegram:"@dilshod_a",requestType:"Sovutish kamerasi",product:"Sut mahsulotlari",dimensions:"7 × 4 × 3 m",capacity:"20 tonna",temperature:"0°C / +4°C",region:"Buxoro",dateLabel:"3 kun oldin",dateGroup:"week",status:"new",isUnread:true,additional:"Loyiha muddatini kelishish kerak.",summary:"Dilshod Buxoroda sut mahsulotlari uchun 20 tonnalik sovutish kamerasi qurmoqchi. Taxminiy o‘lcham 7 × 4 × 3 metr, kerakli harorat 0°C dan +4°C gacha.",managerNote:"",conversation:[{id:"f1",role:"madina",text:"Qanday mahsulot saqlaysiz?"},{id:"f2",role:"customer",text:"Sut mahsulotlari."},{id:"f3",role:"madina",text:"Kamera o‘lchami va hududi qanday?"},{id:"f4",role:"customer",text:"7 × 4 × 3 metr, Buxoro."}] },
];
