import bpy,sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
# Trims gallery railing ends that run on alongside a room wall (they showed as brown bars on the wall,
# e.g. room 201) and hides balusters standing beside a wall. Run once from the Scripting tab before
# prepare_architectural_export.py; '-- --dry' in background only prints.
CLEAR=.12;DRY='--dry' in sys.argv
s=bpy.context.scene;layer_state=[]
for layer in bpy.context.view_layer.layer_collection.children:
 def show(l):
  layer_state.append((l,l.exclude,l.hide_viewport));l.exclude=False;l.hide_viewport=False
  for c in l.children:show(c)
 if layer.name.startswith(('00 | SITE','10 | LC3','20 | LC3','30 | STAIRS','80 | SURROUNDING')):show(layer)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
vis=[o for o in s.objects if o.type=='MESH' and o.visible_get() and not o.hide_render]
railmats={'Finish | Gallery | brown handrail','Finish | Gallery | ochre balusters','Finish | Gallery | granite curb'}
rails=[o for o in vis if 'Gallery' in o.name and {m.name for m in o.data.materials if m}&railmats]
V=[];F=[]
for w in vis:
 if not any(k in w.name for k in ['Wall','Partitions','Coping']) or w in rails:continue
 ev=w.evaluated_get(deps);me=ev.to_mesh();me.transform(ev.matrix_world);off=len(V)
 V+=[v.co.copy() for v in me.vertices];F+=[tuple(off+i for i in p.vertices) for p in me.polygons];ev.to_mesh_clear()
walls=BVHTree.FromPolygons(V,F)
def bounds(o):
 pts=[o.matrix_world@v.co for v in o.data.vertices]
 return Vector([min(p[i] for p in pts) for i in range(3)]),Vector([max(p[i] for p in pts) for i in range(3)])
def beside(p,half,other):
 # Cast sideways at band height: walls crossing the rail's path ahead are not "beside" it.
 for sign in (1,-1):
  d=Vector((0,0,0));d[other]=sign
  if walls.ray_cast(Vector((p.x,p.y,3.96)),d,half+CLEAR)[0] is not None:return True
 return False
trims=[];hides=[]
for o in rails:
 lo,hi=bounds(o);ax=0 if hi.x-lo.x>=hi.y-lo.y else 1;other=1-ax;half=(hi[other]-lo[other])/2;length=hi[ax]-lo[ax]
 def at(a):p=(lo+hi)/2;p[ax]=a;return p
 if length<.3:
  if beside(at(lo[ax]),half,0) or beside(at(lo[ax]),half,1):hides.append(o.name)
  continue
 N=max(2,int(length/.02));samples=[lo[ax]+length*k/N for k in range(N+1)];flags=[beside(at(a),half,other) for a in samples]
 if not any(flags):continue
 free=[a for a,f in zip(samples,flags) if not f]
 if not free:hides.append(o.name);continue
 a,b=min(free),max(free)
 if any(f for x,f in zip(samples,flags) if a<x<b):print('SKIP: wall beside the middle of',o.name);continue
 trims.append((o.name,ax,a,b,round(a-lo[ax],3),round(hi[ax]-b,3)))
for n,ax,a,b,cut0,cut1 in trims:print(' trim',n,'xy'[ax],'start',cut0,'end',cut1)
for n in hides:print(' hide',n)
print('Trimmed',len(trims),'hidden',len(hides))
if not DRY:
 for n,ax,a,b,_,_ in trims:
  o=bpy.data.objects[n];assert o.data.users==1,n;mw=o.matrix_world;inv=mw.inverted()
  for v in o.data.vertices:
   p=mw@v.co;p[ax]=min(max(p[ax],a),b);v.co=inv@p
  o.data.update()
 for n in hides:
  o=bpy.data.objects[n];o.hide_render=True;o.hide_set(True)
 for l,excluded,hidden in layer_state:l.exclude=excluded;l.hide_viewport=hidden
 bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
