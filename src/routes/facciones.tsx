import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, ChevronRight, Search, Shield, Swords, Orbit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/Terminal';
import { GROUP_NAMES, WH40K_CATALOGUE, get40kFaction, searchFactions, type FactionGroup } from '@/lib/warhammer40k-factions';
import aquila from '@/assets/emblems/aquila.png';
import chaos from '@/assets/emblems/chaos_star.png';
export const Route = createFileRoute('/facciones')({
 head: () => ({ meta: [
  {title:'Facciones de Warhammer 40.000 · Atalaya'},
  {name:'description',content:'Facciones, capítulos y destacamentos de Warhammer 40.000, undécima edición, contrastados con el Munitorum Field Manual.'},
  {property:'og:title',content:'Facciones de Warhammer 40.000 · Atalaya'},
  {property:'og:description',content:'Imperium, Caos y Xenos: ejércitos y variantes oficiales de la undécima edición.'},
  {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'},
 ]}), component: Factions,
});
function Factions() {
 const [group,setGroup] = useState<FactionGroup|'all'>('all');
 const [query,setQuery] = useState('');
 const [selectedId,setSelectedId] = useState('space-marines');
 const selected = get40kFaction(selectedId);
 const results = searchFactions(query,group);
 if (!selected) return null;
 return <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-8">
  <header className="flex items-center justify-between border-b border-border pb-4"><Button asChild variant="ghost"><Link to="/"><ArrowLeft/> Atalaya</Link></Button><ThemeToggle/></header>
  <div className="flex items-center gap-5 py-8"><img src={aquila} alt="Aquila imperial" className="hidden h-20 w-20 object-contain sm:block"/><div><p className="text-xs uppercase text-muted-foreground">Warhammer 40.000 · 11.ª edición</p><h1 className="mt-2 text-3xl text-primary sm:text-4xl">Facciones</h1><p className="mt-3 text-sm text-muted-foreground">30 entradas oficiales · Imperium / Caos / Xenos</p></div></div>
  <div className="flex flex-wrap items-center gap-2 border-y border-border py-4"><div role="group" aria-label="Familia de facciones" className="flex flex-wrap gap-1">{(['all','imperium','chaos','xenos'] as const).map(g => <Button key={g} variant={group===g?'default':'outline'} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g==='imperium'&&<Shield/>}{g==='chaos'&&<Swords/>}{g==='xenos'&&<Orbit/>}{g==='all'?'Todas':GROUP_NAMES[g]}</Button>)}</div><div className="relative w-full sm:ml-auto sm:w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input aria-label="Buscar facción o variedad" placeholder="Buscar facción o variedad…" value={query} onChange={e=>setQuery(e.target.value)} className="pl-9"/></div></div>
  <div className="grid items-start gap-8 py-6 lg:grid-cols-[320px_minmax(0,1fr)]"><aside aria-label="Lista de facciones"><p className="mb-3 text-xs text-muted-foreground">{results.length} resultados</p>{results.length===0&&<p className="py-6 text-sm text-muted-foreground">No hay coincidencias.</p>}<div className="space-y-1">{results.map(f=><Button key={f.id} variant={f.id===selected.id?'secondary':'ghost'} aria-pressed={f.id===selected.id} onClick={()=>setSelectedId(f.id)} className="h-auto min-h-12 w-full justify-between whitespace-normal px-3 py-3 text-left"><span><span className="block">{f.name}</span><span className="text-[10px] text-muted-foreground">{GROUP_NAMES[f.group as FactionGroup]}{f.parentId?' · Capítulo':f.role==='support'?' · Apoyo titánico':''}</span></span><ChevronRight/></Button>)}</div></aside>
  <section aria-label="Detalle de facción" className="min-w-0 lg:sticky lg:top-6"><div className="flex items-start justify-between gap-4 border-b border-border pb-5"><div>{selected.parentId&&<Button variant="link" className="mb-2 h-auto p-0" onClick={()=>setSelectedId(selected.parentId??'space-marines')}><ArrowLeft/> Marines Espaciales</Button>}<p className="text-xs uppercase text-muted-foreground">{GROUP_NAMES[selected.group as FactionGroup]}{selected.role==='support'?' · Apoyo titánico':''}</p><h2 className="mt-2 break-words text-2xl text-primary">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.officialName}</p></div>{selected.group!=='xenos'&&<img src={selected.group==='chaos'?chaos:aquila} alt="" className="h-14 w-14 shrink-0 object-contain"/>}</div>
  {selected.variants.length>0&&<div className="py-6"><h3 className="mb-4 text-base">{selected.id==='space-marines'?'Capítulos con opciones propias':'Fuerzas con unidades propias'}</h3><div className="grid gap-2 sm:grid-cols-2">{selected.variants.map(v=>v.catalogueId?<Button key={v.id} variant="outline" className="h-auto min-h-12 justify-between whitespace-normal text-left" onClick={()=>{if(v.catalogueId)setSelectedId(v.catalogueId)}}>{v.name}<ChevronRight/></Button>:<div key={v.id} className="border border-border px-4 py-3 text-sm">{v.name}</div>)}</div></div>}
  <div className="py-6"><h3 className="mb-4 flex flex-wrap items-center gap-2 text-base">Destacamentos <span className="text-xs text-muted-foreground">/ {selected.detachments.length}</span></h3>{selected.detachments.length===0?<p className="text-sm text-muted-foreground">El manual incluye unidades titánicas de apoyo; no enumera destacamentos propios.</p>:<ul className="grid gap-x-6 sm:grid-cols-2">{selected.detachments.map((d,i)=><li key={d.id} className="flex min-h-12 items-center gap-3 border-b border-border py-3"><span className="text-xs text-muted-foreground">{String(i+1).padStart(2,'0')}</span><span className="break-words text-xs">{d.name}</span></li>)}</ul>}</div>
  <footer className="border-t border-border pt-4 text-xs text-muted-foreground"><a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-primary underline">Munitorum Field Manual · v{WH40K_CATALOGUE.sourceVersion}<ArrowUpRight size={14}/></a><p className="mt-2">Consultado: 19/10/2026 · Nombres de destacamentos en inglés oficial.</p></footer></section></div>
 </main>;
}
