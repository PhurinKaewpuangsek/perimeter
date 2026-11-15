import bpy,bmesh,math,os,random
from mathutils import Matrix,Vector
# Adds static low-poly site props in the model's existing palette (no new materials, no textures):
# - restyles the 21 campus trees and the 10 west-courtyard shrubs as faceted architectural-model trees
#   on the same spots (the old objects are hidden, not deleted);
# - seating sets (a table with a slatted bench on each long side): three in a row at plan cell 5H, one
#   at F1 and three along the west wall of room 119 at 5B of the floor-1 grid, and a drinking-water dispenser against the west wall of room 123 (cell I5).
# The plan is drawn smaller than the real building (a lecture room is a few metres across), so the
# seating and the dispenser are built at real size and then scaled by PROP_SCALE to sit in proportion
# with the rooms and the fountain. They use the plan's muted walkway and grey colours so they do not
# stand out. The bench and the water cooler are downloaded meshes in props/ (see props/CREDITS.md) whose
# own materials are replaced; the trees and tables are built here.
# Positions were given by the team on a floor-1 plan with 5 m cells (column A at Blender X -64, row 1 at Y 19).
# Each prop kind is one object and every material is one its group already uses; the exporter merges
# each group per material, so the props add no draw calls.
# Nothing is animated: the web map renders on demand. Everything is looked up and checked before the
# first change. A rerun replaces the props it made before. Runs headless:
#   blender -b lc3-campus-layout.blend --python add_site_props.py
assert bpy.context.scene.name=='LC3 | Site assembly','Open scene LC3 | Site assembly first'
s=bpy.context.scene;vl=bpy.context.view_layer
MATS={k:bpy.data.materials.get(n) for k,n in {
 'foliage':'Finish | garden foliage','foliage_light':'Finish | garden foliage light','trunk':'Finish | Campus | tree trunks',
 'wood':'Finish | East courtyard | walkway','frame':'Finish | WC | gray floor','iron':'Finish | WC | door frames','steel':'Finish | WC | white ceramic',
 'blue':'WC | blue signage','red':'WC | burgundy signage'}.items()}
for k,m in MATS.items():assert m,'Missing material for '+k
COLL={k:bpy.data.collections.get(n) for k,n in {'campus':'82 | Roads paths and green areas','yard':'F1 | Architectural landscape finish','floor1':'10 | LC3 - FLOOR 1'}.items()}
for k,c in COLL.items():assert c,'Missing collection for '+k
assert COLL['campus'].name in {c.name for c in bpy.data.collections['80 | SURROUNDING BUILDINGS'].children_recursive}
assert COLL['yard'].name in {c.name for c in COLL['floor1'].children_recursive}
old_trees=[(bpy.data.objects.get('Context_Tree_Canopy'+x),bpy.data.objects.get('Context_Tree_Trunk'+x)) for x in ['']+['.%03d'%i for i in range(1,21)]]
old_shrubs=[bpy.data.objects.get('Garden_Shrub_%02d'%i) for i in range(10)]
for o in [o for pair in old_trees for o in pair]+old_shrubs:assert o and o.name in vl.objects,'Missing or unlinked object'
PROP_DIR=os.path.join(os.path.dirname(bpy.data.filepath),'props')
BENCH_GLB=os.path.join(PROP_DIR,'park-bench-j-toastie.glb');COOLER_GLB=os.path.join(PROP_DIR,'water-cooler-j-toastie.glb')
for f in (BENCH_GLB,COOLER_GLB):assert os.path.isfile(f),'Missing prop mesh: '+f
PROP_SCALE=.55
PROPS='Campus_Trees_LowPoly','F1_Courtyard_Trees_LowPoly','F1_Seating_Sets','F1_Drinking_Water_Dispenser'
RETIRED='F1_Chaipattana_Aerators',  # an earlier draft; removed if present
PROP_COLL='F1 | Site props - seating and water dispenser'
# Changes start here.
layer_state=[]
def show(l):
 layer_state.append((l,l.exclude,l.hide_viewport));l.exclude=False;l.hide_viewport=False
 for c in l.children:show(c)
for layer in vl.layer_collection.children:
 if layer.name.startswith(('00 | SITE','10 | LC3','20 | LC3','30 | STAIRS','80 | SURROUNDING')):show(layer)
for n in PROPS+RETIRED:
 o=bpy.data.objects.get(n)
 if o:
  me=o.data;bpy.data.objects.remove(o,do_unlink=True)
  if me.users==0:bpy.data.meshes.remove(me)
props=bpy.data.collections.get(PROP_COLL) or bpy.data.collections.get('F1 | Site props - seating, water dispenser, aerators')
if not props:props=bpy.data.collections.new(PROP_COLL);COLL['floor1'].children.link(props)
props.name=PROP_COLL
for o in [o for pair in old_trees for o in pair]+old_shrubs:o.hide_render=True;o.hide_set(True)
# Ground heights: floor 2 and the stairs would block rays, so they are excluded while sampling.
def find(l,name):
 if l.name==name:return l
 for c in l.children:
  r=find(c,name)
  if r:return r
upper=[find(vl.layer_collection,n) for n in ('20 | LC3 - FLOOR 2 - toggle','30 | STAIRS - F1 to F2')]
upper_state=[(l,l.exclude) for l in upper]
for l in upper:l.exclude=True
vl.update();dg=bpy.context.evaluated_depsgraph_get()
def ground(x,y):
 hit,loc,*_=s.ray_cast(dg,Vector((x,y,20)),Vector((0,0,-1)));assert hit,'No ground at %s,%s'%(x,y);return loc.z
shrub_spots=[(o.matrix_world.translation.x,o.matrix_world.translation.y,o.data.materials[0].name.endswith('light')) for o in old_shrubs]
yard_ground=[ground(x,y) for x,y,_ in shrub_spots]
# Three sets in a row along the water's edge in the 5H corridor (the floor starts at Y -2.05), one in the F1 entrance hall, and three in a line along the
# west wall of room 119 in 5B, turned so their benches face north and south and a table end meets the wall.
# The 5B line stops at the room's south wall (Y -5.0), leaving the corridor that turns east there clear.
SEATS=[(-29.4,-2.5,0),(-27.2,-2.5,0),(-25.0,-2.5,0),(-36.4,14.4,0),(-54.47,-1.43,90),(-54.47,-2.85,90),(-54.47,-4.27,90)]
seat_ground=[ground(x,y) for x,y,_ in SEATS]
DISPENSER=(-21.85,-4.45,90);dispenser_ground=ground(*DISPENSER[:2])
for l,e in upper_state:l.exclude=e
# Geometry helpers: every part is flat-shaded; parts resting on a floor start 2 cm below it, so their
# bottoms hide inside the slab instead of sitting level with it.
class Kit:
 def __init__(s,mats):s.bm=bmesh.new();s.mats=mats
 def _tag(s,before,mat):
  for f in set(s.bm.faces)-before:f.material_index=s.mats.index(mat);f.smooth=False
 def box(s,M,size,mat):
  b=set(s.bm.faces);bmesh.ops.create_cube(s.bm,size=1,matrix=M@Matrix.Diagonal((*size,1)));s._tag(b,mat)
 def prism(s,M,r1,r2,h,seg,mat,caps=True):
  b=set(s.bm.faces);bmesh.ops.create_cone(s.bm,cap_ends=caps,cap_tris=False,segments=seg,radius1=r1,radius2=r2,depth=h,matrix=M@Matrix.Translation((0,0,h/2)));s._tag(b,mat)
 def ico(s,M,r,sz,mat):
  b=set(s.bm.faces);bmesh.ops.create_icosphere(s.bm,subdivisions=2,radius=r,matrix=M@Matrix.Diagonal((1,1,sz,1)));s._tag(b,mat)
 def place(s,src,M,mats):
  # Copies a loaded mesh; its face material_index points into mats, a list of palette keys.
  me=bpy.data.meshes.new('_prop_tmp');src.to_mesh(me);me.transform(M)
  b=set(s.bm.faces);s.bm.from_mesh(me)
  for f in set(s.bm.faces)-b:f.material_index=s.mats.index(mats[f.material_index]);f.smooth=False
  bpy.data.meshes.remove(me)
 def object(s,name,coll):
  me=bpy.data.meshes.new(name);s.bm.to_mesh(me);s.bm.free()
  for m in s.mats:me.materials.append(MATS[m])
  o=bpy.data.objects.new(name,me);coll.objects.link(o);return o
T=lambda x,y,z:Matrix.Translation((x,y,z))
R=lambda deg,axis='Z':Matrix.Rotation(math.radians(deg),4,axis)
def load_glb(path):
 # Imports a GLB, returns its triangles as one bmesh in Blender Z-up metres plus the source material
 # name of every face (as material_index), and removes everything the import created.
 before={k:set(getattr(bpy.data,k)) for k in ('objects','meshes','materials','images','collections')}
 bpy.ops.import_scene.gltf(filepath=path)
 new={k:[x for x in getattr(bpy.data,k) if x not in before[k]] for k in before}
 bm=bmesh.new();names=[]
 for o in new['objects']:
  if o.type!='MESH':continue
  me=o.data.copy();me.transform(o.matrix_world);b=set(bm.faces);bm.from_mesh(me)
  local=[m.name if m else '' for m in me.materials]
  for f in set(bm.faces)-b:
   n=local[f.material_index] if f.material_index<len(local) else ''
   if n not in names:names.append(n)
   f.material_index=names.index(n)
  bpy.data.meshes.remove(me)
 for k in ('objects','meshes','materials','images','collections'):
  for x in new[k]:
   if x.name in getattr(bpy.data,k):getattr(bpy.data,k).remove(x)
 bmesh.ops.triangulate(bm,faces=bm.faces[:])
 return bm,names
def bounds(bm):
 return [min(v.co[i] for v in bm.verts) for i in range(3)],[max(v.co[i] for v in bm.verts) for i in range(3)]
# Bench: long axis along local X, sitter facing +Y, back towards -Y, 1.44 m long, feet 2 cm below the floor.
bench_bm,bench_names=load_glb(BENCH_GLB);lo,hi=bounds(bench_bm)
top=[v.co for v in bench_bm.verts if v.co.z>lo[2]+.85*(hi[2]-lo[2])]
back_x=sum(c.x for c in top)/len(top)-(lo[0]+hi[0])/2
long_y=(hi[1]-lo[1])>(hi[0]-lo[0]);assert long_y,'Bench mesh is expected to run along Y'
bench_norm=T(0,0,-.02)@R(-90 if back_x>0 else 90)@Matrix.Scale(1.44/(hi[1]-lo[1]),4)@T(-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2])
bench_mats=['wood' if 'wood' in n.lower() else 'frame' for n in bench_names]
# Water cooler: taps facing +Y, 1.4 m tall with its bottle, feet 2 cm below the floor. Its plastic body
# is painted white, the bottle and cold tap blue, the hot tap burgundy.
cooler_bm,cooler_names=load_glb(COOLER_GLB);lo,hi=bounds(cooler_bm)
taps=[f.calc_center_median() for f in cooler_bm.faces if cooler_names[f.material_index] in ('Red','Blue')];assert taps,'Water cooler taps not found'
tap=sum(taps,Vector())/len(taps)-Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,0))
cooler_norm=T(0,0,-.02)@R(90-math.degrees(math.atan2(tap.y,tap.x)))@Matrix.Scale(1.4/(hi[2]-lo[2]),4)@T(-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2])
cooler_mats=[{'BluePlastic':'blue','Blue':'blue','Red':'red'}.get(n,'steel') for n in cooler_names]
def tree(k,x,y,z,scale,leaf,trunk,seed):
 r=random.Random(seed);s_=scale*r.uniform(.9,1.12);base=T(x,y,z)@R(r.uniform(0,360))
 k.prism(base@T(0,0,-.05),.13*s_,.07*s_,2.45*s_,6,trunk,caps=False)
 for (dx,dy,dz,rad) in [(0,0,2.9,1.35),(.75,.3,2.45,.95),(-.55,-.6,2.6,1.0)]:
  k.ico(base@T(dx*s_,dy*s_,dz*s_)@R(r.uniform(0,72)),rad*s_*r.uniform(.92,1.08),.8,leaf)
def bench(k,M):k.place(bench_bm,M@bench_norm,bench_mats)
def seating(k,x,y,z,yaw):
 # The table's long side runs along local Y; one bench on each long side faces it.
 M=T(x,y,z)@R(yaw)@Matrix.Scale(PROP_SCALE,4)
 k.box(M@T(0,0,.74),(.7,1.2,.04),'wood')
 for ly in (-.45,.45):k.box(M@T(0,ly,.355),(.55,.06,.75),'frame')
 k.box(M@T(0,0,.2),(.05,.9,.05),'frame')
 bench(k,M@T(-.85,0,0)@R(-90));bench(k,M@T(.85,0,0)@R(90))
k=Kit(['foliage','trunk'])
for i,(c,_) in enumerate(old_trees):
 w=c.matrix_world.translation;tree(k,w.x,w.y,min((_.matrix_world@Vector(v)).z for v in _.bound_box),1.0,'foliage','trunk',i)
k.object(PROPS[0],COLL['campus'])
k=Kit(['foliage','foliage_light','wood'])
for i,((x,y,light),z) in enumerate(zip(shrub_spots,yard_ground)):tree(k,x,y,z,.58,'foliage_light' if light else 'foliage','wood',100+i)
k.object(PROPS[1],COLL['yard'])
k=Kit(['wood','frame'])
for (x,y,yaw),z in zip(SEATS,seat_ground):seating(k,x,y,z,yaw)
k.object(PROPS[2],props)
k=Kit(['steel','blue','red'])
x,y,yaw=DISPENSER;k.place(cooler_bm,T(x,y,dispenser_ground)@R(yaw)@Matrix.Scale(PROP_SCALE,4)@cooler_norm,cooler_mats)
k.object(PROPS[3],props)
for l,excluded,hidden in layer_state:l.exclude=excluded;l.hide_viewport=hidden
vl.update()
tris=lambda o:sum(len(p.vertices)-2 for p in o.data.polygons)
for n in PROPS:print('Prop',n,'triangles',tris(bpy.data.objects[n]))
print('Hidden old trees and shrubs',sum(tris(o) for pair in old_trees for o in pair)+sum(tris(o) for o in old_shrubs),'triangles')
bench_bm.free();cooler_bm.free()
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
