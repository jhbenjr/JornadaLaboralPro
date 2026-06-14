/* ══════════════════════════ STATE & GLOBALS ══════════════════════════ */
let events = []; 
let activities=[];
let people = []; 
let activeEventId = null;
let editingId=null;
let modalSchedules = [];     // array de horarios seleccionados (multi-select)
let modalExtempTime = '';    // hora personalizada para Extemporáneo
let modalTaskBlocks=[];
let currentTab = 'acts';
let editingPersonId = null;
const _expandedPeople = new Set();
let editingPersonPhoto = null;
let oldActResp = ''; 
let taskIdCounter = 0; 
const filters={horarios:new Set(),lugares:new Set(),actividades:new Set(),
  tareas:new Set(),responsables:new Set(),asignados:new Set(),prioridad:new Set(),estado:new Set(),departamentos:new Set()};

let teams = [];
