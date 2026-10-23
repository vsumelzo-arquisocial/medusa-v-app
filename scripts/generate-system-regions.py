import json, base64, math, random
import numpy as np
from PIL import Image
W,H=256,128
BODIES=[("medusa-2","medusa-2.jpg",36,"desert"),("medusa-3","medusa-3.jpg",24,"red"),("medusa-3a","moon-dark.jpg",3,"m-forja"),
("medusa-4","medusa-4.jpg",54,"earth"),("medusa-4a","moon-grey.jpg",4,"m-mina"),("medusa-4b","moon-dark.jpg",5,"m-puerto"),
("medusa-8","medusa-8.jpg",30,"ice"),("medusa-8a","moon-grey.jpg",6,"m-bastion")]
TYPES={"desert":["arsenal"]*5+["mina"]*4+["yermo"]*5+["bastion"]*3+["colmena"]*2+["puerto"]*2+["forja"]*2+["dique"]*1,
"red":["forja"]*5+["mina"]*4+["dique"]*3+["yermo"]*4+["arsenal"]*2+["bastion"]*2+["colmena"]+["puerto"],
"earth":["puerto"]*6+["colmena"]*6+["mina"]*5+["yermo"]*5+["arsenal"]*3+["forja"]*2+["dique"]*3+["bastion"]*2,
"ice":["bastion"]*5+["dique"]*4+["yermo"]*5+["mina"]*3+["puerto"]*2+["forja"]*2+["colmena"]+["arsenal"]}
PREF={"yermo":{"desert":["Dunas de","Erg de","Salinas de"],"red":["Llanura de","Cañón de","Cráter de"],"earth":["Selva de","Marismas de","Estepa de"],"ice":["Glaciar de","Tundra de","Campo helado de"],"moon":["Mar seco de","Cráter de"]},
"mina":["Minas de","Pozos de","Excavación"],"forja":["Forja","Fundición de"],"dique":["Dique","Astillero de"],"arsenal":["Arsenal","Polvorín de"],
"colmena":["Colmena","Ciudad colmena"],"puerto":["Puerto","Muelles de"],"bastion":["Bastión","Ciudadela","Fortaleza"]}
SY=["vor","kal","th","ar","ven","dra","mor","sul","ix","ten","gal","rho","bar","nex","os","um","cor","ze","lath","quor","bel","stra","gon","myr","pha","tor","ul","vex","hal","dor"]
def vec(i,j):
    lon=((i+0.5)/W-0.5)*2*math.pi; lat=(0.5-(j+0.5)/H)*math.pi
    return np.array([math.cos(lat)*math.sin(lon),math.sin(lat),math.cos(lat)*math.cos(lon)])
V=np.array([[vec(i,j) for i in range(W)] for j in range(H)])
out=[];sql=[];gid=42;used=set();rnd=random.Random(40000)
def pname(t,biome):
    while True:
        n="".join(rnd.choice(SY) for _ in range(rnd.choice([2,2,3]))).capitalize()
        p=PREF[t]; p=p.get(biome if biome in p else "moon") if isinstance(p,dict) else p
        s=f"{rnd.choice(p)} {n}"
        if s not in used and len(n)<=9: used.add(s); return s
for bid,tex,N,biome in BODIES:
    img=np.asarray(Image.open(f"src/assets/planet/{tex}").convert("RGB").resize((W,H)),dtype=float)
    land=np.ones((H,W),bool)
    if biome=="earth":
        r,g,b=img[...,0],img[...,1],img[...,2]
        land=~((b>r+25)&(b>g+5))
        # drop small islands
        lab=-np.ones((H,W),int);c=0
        for j in range(H):
            for i in range(W):
                if land[j,i] and lab[j,i]<0:
                    st=[(j,i)];lab[j,i]=c;cells=[]
                    while st:
                        y,x=st.pop();cells.append((y,x))
                        for dy,dx in((1,0),(-1,0),(0,1),(0,-1)):
                            yy,xx=y+dy,(x+dx)%W
                            if 0<=yy<H and land[yy,xx] and lab[yy,xx]<0: lab[yy,xx]=c;st.append((yy,xx))
                    if len(cells)<40:
                        for y,x in cells: land[y,x]=False
                    c+=1
    # seeds: area-weighted random land points with min spacing
    pts=[(j,i) for j in range(H) for i in range(W) if land[j,i]]
    wts=np.array([math.cos((0.5-(j+0.5)/H)*math.pi) for j,i in pts]);wts/=wts.sum()
    seeds=[]
    for _ in range(N):
        best=None;bd=-1
        for k in rnd.choices(range(len(pts)),weights=wts,k=40):
            v=V[pts[k]]
            d=min([1-float(v@s) for s in seeds],default=9)
            if d>bd: bd=d;best=v
        seeds.append(best)
    S=np.array(seeds)
    noise=np.random.default_rng(len(bid)*7+N).normal(0,0.02,(H,W,3))
    dots=np.einsum('hwc,nc->hwn',V+noise,S)
    grid=np.where(land,dots.argmax(-1),255).astype(np.uint8)
    adj=[set() for _ in range(N)]
    for j in range(H):
        for i in range(W):
            a=grid[j,i]
            if a==255: continue
            for b in (grid[j,(i+1)%W], grid[j+1,i] if j+1<H else 255):
                if b!=255 and b!=a: adj[a].add(int(b));adj[int(b)].add(int(a))
    cent=[]
    for n in range(N):
        m=V[grid==n].sum(0); cent.append(m/np.linalg.norm(m))
    # components
    comp=[-1]*N;cc=0
    for n in range(N):
        if comp[n]<0:
            st=[n];comp[n]=cc
            while st:
                x=st.pop()
                for y in adj[x]:
                    if comp[y]<0: comp[y]=cc;st.append(y)
            cc+=1
    sea=[set() for _ in range(N)]
    groups={}
    for n in range(N): groups.setdefault(comp[n],[]).append(n)
    linked={0};pairs=[]
    while len(linked)<cc:
        best=None
        for a in linked:
            for b in range(cc):
                if b in linked: continue
                for x in groups[a]:
                    for y in groups[b]:
                        d=1-float(cent[x]@cent[y])
                        if best is None or d<best[0]: best=(d,x,y,b)
        _,x,y,b=best;sea[x].add(y);sea[y].add(x);linked.add(b)
    types=TYPES.get(biome)
    regs=[]
    for n in range(N):
        if types: t=rnd.choice(types)
        else: t="yermo" if n==0 else biome[2:]
        name=pname(t,biome)
        g=gid+n
        L=sorted(gid+x for x in adj[n]); Sx=sorted(gid+x for x in sea[n])
        regs.append({"id":g,"center":[round(float(c),5) for c in cent[n]],"land":L,"sea":Sx,"continent":comp[n]})
        nb=sorted(set(L+Sx))
        sql.append(f"({g},'{name.replace(chr(39),chr(39)*2)}','{t}','{{{','.join(map(str,nb))}}}',{comp[n]},'{bid}')")
    json.dump({"w":W,"h":H,"offset":gid,"grid":base64.b64encode(grid.tobytes()).decode(),"regions":regs},open(f"src/data/bodies/{bid}.json","w"))
    print(bid,N,"continents",cc,"isolated",sum(1 for r in regs if not r["land"] and not r["sea"]))
    gid+=N
open("/tmp/sys/regions.sql","w").write("INSERT INTO public.regions (id,name,type,neighbors,continent,body_id) VALUES\n"+",\n".join(sql)+"\nON CONFLICT (id) DO NOTHING;\n")
print(gid)
