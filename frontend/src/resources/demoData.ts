export type DemoRegionId = 'chennai' | 'nilgiris' | 'cuddalore';
export type DemoCategory = 'Flood rescue' | 'Medical' | 'Structural search' | 'Engineering' | 'Coastal rescue';

export interface DemoResource {
  id: string;
  name: string;
  category: DemoCategory;
  region: DemoRegionId | 'all';
  location: string;
  capability: string;
  package: string;
  readiness: 'Staged' | 'Clearance required' | 'Shared reserve';
  assignedTo: string;
  note: string;
}

export const DEMO_REGIONS: Array<{ id: DemoRegionId; label: string; hazard: string }> = [
  { id: 'chennai', label: 'Chennai', hazard: 'Urban flooding' },
  { id: 'nilgiris', label: 'Nilgiris', hazard: 'Landslide response' },
  { id: 'cuddalore', label: 'Cuddalore', hazard: 'Storm surge' },
];

/** Fictional planning packages derived from the Tamil Nadu demo response scenario. */
export const DEMO_RESOURCES: DemoResource[] = [
  {
    id: 'RES-V01', name: 'NDRF flood rescue team', category: 'Flood rescue', region: 'chennai',
    location: 'Perumbakkam staging area', capability: 'Swift-water rescue · rooftop extraction',
    package: 'IRB boats · diver team · flood PPE', readiness: 'Staged', assignedTo: 'Perumbakkam blocks A–C',
    note: 'Prioritize stranded households on upper floors. Maintain boat buddy checks and avoid energized water.',
  },
  {
    id: 'RES-V02', name: 'SDRF pump & shelter team', category: 'Flood rescue', region: 'chennai',
    location: 'Pallikaranai high ground', capability: 'Water removal · shelter support',
    package: 'Portable pump · shelter logistics kit', readiness: 'Staged', assignedTo: 'Pallikaranai marsh-edge housing',
    note: 'The demo scenario flags pump-house power as a constraint. Confirm isolation before pump deployment.',
  },
  {
    id: 'RES-V03', name: 'Collapse search team', category: 'Structural search', region: 'nilgiris',
    location: 'Coonoor Ghat Road staging point', capability: 'Void search · shoring',
    package: 'Search cameras · shoring kit · spotter', readiness: 'Clearance required', assignedTo: 'Coonoor Ghat Road slide fan',
    note: 'Wait for geotechnical clearance; halt work if rainfall or slope movement increases.',
  },
  {
    id: 'RES-V04', name: 'Geotechnical assessment unit', category: 'Engineering', region: 'nilgiris',
    location: 'Ketty Valley access point', capability: 'Slope survey · access checks',
    package: 'Slope survey instruments · rain watch', readiness: 'Staged', assignedTo: 'Ketty Valley hamlets',
    note: 'Check secondary-slip exposure and confirm a safe route before the rescue rotation moves uphill.',
  },
  {
    id: 'RES-V05', name: 'Coastal rescue & breach crew', category: 'Coastal rescue', region: 'cuddalore',
    location: 'Parangipettai inland boat stage', capability: 'Coastal extraction · breach response',
    package: 'Rescue boats · life jackets · breach-plug kit', readiness: 'Staged', assignedTo: 'Parangipettai coast belt',
    note: 'Keep boats staged inland and withdraw before the next surge band. Life jackets are mandatory.',
  },
  {
    id: 'RES-V06', name: 'Medical task force', category: 'Medical', region: 'all',
    location: 'Tamil Nadu regional reserve', capability: 'Advanced life support · field triage',
    package: '18 ambulances · 2 ALHT helicopters', readiness: 'Shared reserve', assignedTo: 'All three regions',
    note: 'Prioritize casualty transfer routes and coordinate helicopter landing zones with local incident command.',
  },
];
