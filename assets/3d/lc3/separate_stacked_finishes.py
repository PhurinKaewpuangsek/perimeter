import bpy,collections,json,os,shutil,sys
from mathutils import Vector,geometry
# Lifts stacked flat finishes (SVG paint layers, outlines, grass) so each colour sits at least GAP above the
# surface it covers. They were 0-0.9 mm apart, finer than a phone depth buffer resolves, so they flickered.
# Run once from the Scripting tab before prepare_architectural_export.py; '-- --dry' in background only prints.
GAP=.01;WINDOW=.1;DRY='--dry' in sys.argv
s=bpy.context.scene;folder=os.path.dirname(bpy.data.filepath);layer_state=[]
for layer in bpy.context.view_layer.layer_collection.children:
 def show(l):
  layer_state.append((l,l.exclude,l.hide_viewport));l.exclude=False;l.hide_viewport=False
  for c in l.children:show(c)
 if layer.name.startswith(('00 | SITE','10 | LC3','20 | LC3','30 | STAIRS','80 | SURROUNDING')):show(layer)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
def look(m):
 # Materials with identical shader values render identically, so their overlap cannot flicker.
 b=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if m and m.use_nodes else None
 return tuple(round(x,3) for x in b.inputs['Base Color'].default_value[:3])+(round(b.inputs['Roughness'].default_value,3),) if b else (m.name if m else '')
tris=[]
for ob in s.objects:
 if ob.type not in {'MESH','CURVE'} or not ob.visible_get() or ob.hide_render:continue
 ev=ob.evaluated_get(deps);me=ev.to_mesh()
 if not me:continue
 me.calc_loop_triangles();mw=ev.matrix_world;nm=mw.to_3x3().inverted().transposed()
 for t in me.loop_triangles:
  if (nm@t.normal).normalized().z<.999:continue
  p=[mw@me.vertices[i].co for i in t.vertices]
  if geometry.area_tri(*p)<.0005:continue
  c=sum(p,Vector())/3
  # Shrink 1 mm toward the centroid so finishes that only share an edge do not count as stacked.
  q=[(c+(v-c)*(1-.001/max((v-c).length,.001))).to_2d() for v in p]
  tris.append((ob.name,look(me.materials[t.material_index] if t.material_index<len(me.materials) else None),c.z,q,min(v.x for v in q),max(v.x for v in q),min(v.y for v in q),max(v.y for v in q)))
 ev.to_mesh_clear()
def overlap(a,b):
 if a[4]>b[5] or b[4]>a[5] or a[6]>b[7] or b[6]>a[7]:return False
 A,B=a[3],b[3]
 if any(geometry.intersect_point_tri_2d(v,*B) for v in A) or any(geometry.intersect_point_tri_2d(v,*A) for v in B):return True
 return any(geometry.intersect_line_line_2d(A[i],A[(i+1)%3],B[j],B[(j+1)%3]) for i in range(3) for j in range(3))
grid=collections.defaultdict(list)
for i,t in enumerate(tris):
 for gx in range(int(t[4]//2),int(t[5]//2)+1):
  for gy in range(int(t[6]//2),int(t[7]//2)+1):grid[gx,gy].append(i)
walls={o.name for o in s.objects if any(k in o.name for k in ['Wall','Partitions'])}
need={};sink={};seen=set()  # (lower,upper) -> smallest original height difference
for cell in grid.values():
 for x in range(len(cell)):
  for y in range(x+1,len(cell)):
   i,j=cell[x],cell[y]
   if (i,j) in seen:continue
   seen.add((i,j));a,b=tris[i],tris[j]
   if a[0]==b[0] or a[1]==b[1] or abs(a[2]-b[2])>=WINDOW or not overlap(a,b):continue
   # Lower surface first; level ties keep SVG paint order (later index on top).
   lo,hi=sorted((a,b),key=lambda t:(round(t[2],5),t[0]))
   # Wall caps level with partition tops: sink the lower wall, since lifting it would open a gap at its base.
   if lo[0] in walls and hi[0] in walls:
    if hi[2]-lo[2]<GAP:sink[lo[0]]=max(sink.get(lo[0],0),GAP-(hi[2]-lo[2]))
    continue
   need[lo[0],hi[0]]=min(need.get((lo[0],hi[0]),1),hi[2]-lo[2])
assert not any((u,l) in need for l,u in need),'Surfaces cross each other; a lift cannot separate them'
below=collections.defaultdict(list)
for (l,u),dz in need.items():below[u].append((l,dz))
lift={}
def solve(n):
 if n not in lift:lift[n]=max([0]+[solve(l)+GAP-dz for l,dz in below[n]])
 return lift[n]
for n in sorted({n for pair in need for n in pair}):solve(n)
# Skip float noise (a rerun on the fixed model computes lifts under 0.2 mm).
moved={n:round(v,4) for n,v in sorted(lift.items()) if v>.0002}
assert max(moved.values(),default=0)<WINDOW-GAP,'Lift exceeds the scan window; widen WINDOW'
assert not set(sink)&set(moved),'A sunk wall is also lifted'
print('Stacked pairs',len(need),'lifted objects',len(moved),'max lift',max(moved.values(),default=0))
for n,v in moved.items():print(' lift',n,v,'over',max(below[n],key=lambda b:lift[b[0]]-b[1])[0])
for n,v in sink.items():print(' sink',n,round(v,4));moved[n]=-round(v,4)
if not DRY:
 backup=folder+'/lc3-campus-layout-before-finish-lift.blend'
 if not os.path.exists(backup):shutil.copy2(bpy.data.filepath,backup)
 for n,v in moved.items():
  ob=bpy.data.objects[n];assert not ob.children,n;ob.matrix_world.translation.z+=v
 s['finish_lift']=json.dumps(moved)
 for l,excluded,hidden in layer_state:l.exclude=excluded;l.hide_viewport=hidden
 bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
