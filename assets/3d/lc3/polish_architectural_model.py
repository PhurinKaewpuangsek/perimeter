import bpy, math, bmesh, json, os
from mathutils import Vector, Matrix
s=bpy.context.scene; folder=os.path.dirname(bpy.data.filepath)
assert s.name=='LC3 | Site assembly'

def linear(c): return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
def rgba(hex): return tuple(linear(int(hex[i:i+2],16)/255) for i in (0,2,4))+(1,)
def material(name,color,rough=.72,metal=0):
 m=bpy.data.materials.get('Finish | '+name) or bpy.data.materials.new('Finish | '+name)
 m.use_nodes=True; bsdf=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 bsdf.inputs['Base Color'].default_value=rgba(color);bsdf.inputs['Roughness'].default_value=rough;bsdf.inputs['Metallic'].default_value=metal
 bsdf.inputs['Alpha'].default_value=1;m.diffuse_color=rgba(color)
 return m
palette={
 'LC3_Low_Partitions':('CFD2CB',.78,0),
 'LC3 | exterior wall coping':('EEEDE5',.55,0),
 'LC3 | audited neutral rooms':('DADDD7',.78,0),
 'F1_BaseMaterial':('80918F',.82,0),'F2_BaseMaterial':('A7B1AB',.82,0),
 'Bridge | dark bronze rail':('514B40',.3,.55),
 'Bridge | warm concrete':('D6CFBC',.7,0),
 'Bridge | step nosings':('8D958C',.52,.15),
 'Gallery | brown handrail':('805A3B',.38,0),
 'Gallery | ochre balusters':('B3915E',.5,.12),
 'Gallery | granite curb':('969A8E',.58,0),
 'Balcony | cream concrete':('D8D6C9',.75,0),
 'Balcony | pale fascia':('E0DCCD',.75,0),
 'WC | ivory tile':('CDCEC2',.62,0),
 'WC | white ceramic':('F0F0E7',.24,0),
 'WC | gray floor':('ADB8B1',.62,0),
 'WC | door frames':('626C66',.45,.12),
 'LC3 | planted courtyard green':('78966E',.95,0),
 'LC3 | fountain garden green':('73916B',.95,0),
 'LC3 | open ground green':('79966F',.95,0),
 'Fountain | pale stone rim':('E0DBCA',.43,0),
 'Fountain | basin lining':('366D73',.45,0),
 'Fountain | water indication':('4C9AA6',.2,.18),
 'Fountain | schematic water jets':('A8E1E6',.22,.12),
 'Campus | context concrete':('C4C9BF',.95,0),
 'Campus | muted clay roof':('ACAFA3',.92,0),
 'Campus | pedestrian paving':('C9C9BB',.88,0),
 'Campus | lawn':('ABB79C',.95,0),
 'Campus | walkway columns':('D0D3C7',.75,0),
 'Campus | tree canopy':('698762',.92,0),
 'Campus | tree trunks':('827159',.95,0),
}
vis=[o for o in s.objects if o.type in {'MESH','CURVE'} and o.visible_get() and not o.hide_render]
inventory=json.load(open(folder+'/svg-audit-inventory.json',encoding='utf-8'))
fill_by_material={m:row['svg'].get('fill','') for rows in inventory.values() for row in rows for m in row.get('material',[])}
svg_palette={'#EDE9FE':'C5BEDC','#FAE8FF':'DEC8DA','#FEF3C7':'DFCE9C','#ECFCCB':'C3D2A5','#D1FAE5':'B5D5C7','#CCFBF1':'B9DAD4','#BAE6FD':'65A6AF','#D9D9D9':'D6D8CC','#EFEEEE':'E4E5DD','#FFFFFF':'ECEDE5','white':'ECEDE5','black':'66736B','#111111':'66736B'}
mapping={}
for o in vis:
 for m in o.data.materials:
  if not m or m.name in mapping:continue
  if m.name in palette:mapping[m.name]=material(m.name,*palette[m.name])
  elif m.name.startswith('SVGMat.'):
   # Use original SVG fills, not channel heuristics: grey corridors are not water.
   fill=fill_by_material.get(m.name,'')
   color=svg_palette.get(fill,'E4E5DD')
   is_water=fill=='#BAE6FD'
   mapping[m.name]=material(m.name,color,.25 if is_water else .72,.12 if is_water else 0)
 # Materials are copied only for this assembly; reference scenes retain their originals.
 if o.data.users>1:o.data=o.data.copy()
 for i,m in enumerate(o.data.materials):
  if m and m.name in mapping:o.data.materials[i]=mapping[m.name]

beveled=[]
for o in vis:
 if o.type!='MESH' or 'Context_Tree' in o.name:continue
 is_structure=any(k in o.name for k in ['Partitions','Exterior_Wall','Coping','Shared_Wall','Step_','Landing','Handrail','Brown_Band','Baluster','Fountain_','Solid_Under'])
 if not is_structure or any(k in o.name for k in ['Water','Jet','Opening','Cutter']):continue
 bevel=next((m for m in o.modifiers if m.type=='BEVEL'),None)
 if not bevel:
  bevel=o.modifiers.new('Architectural edge finish','BEVEL')
  bevel.width=min(.018,min(o.dimensions)/8)/max(1,max(abs(v) for v in o.scale))
 else:bevel.width=min(.023,max(bevel.width,.014))
 bevel.segments=3;bevel.harden_normals=True;bevel.use_clamp_overlap=True
 beveled.append(o.name)
 # Round fountain walls, while keeping top caps planar.
 if o.name.startswith('Fountain_'):
  for p in o.data.polygons:p.use_smooth=abs(p.normal.z)<.8

foliage=material('garden foliage','6A8B5D',.95)
foliage_light=material('garden foliage light','89A576',.95)
# Softer multi-lobed canopies in the existing context tree footprints.
tree_mesh=bpy.data.meshes.new('Architectural tree canopy')
bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=3,radius=1)
for v in bm.verts:
 p=v.co;f=1+.085*math.sin(p.x*7+p.z*2)*math.cos(p.y*6-p.z*3);v.co*=f
bm.to_mesh(tree_mesh);bm.free();tree_mesh.materials.append(foliage)
for p in tree_mesh.polygons:p.use_smooth=True
for o in vis:
 if o.name.startswith('Context_Tree_Canopy'):o.data=tree_mesh

col=bpy.data.collections.get('F1 | Architectural landscape finish')
if not col:
 col=bpy.data.collections.new('F1 | Architectural landscape finish');bpy.data.collections['10 | LC3 - FLOOR 1'].children.link(col)
root=bpy.data.objects['LC3_Floor_1.001']
def shrub(x,y,r,h,i):
 name='Garden_Shrub_%02d'%i
 if bpy.data.objects.get(name):return
 ob=bpy.data.objects.new(name,tree_mesh.copy());col.objects.link(ob)
 ob.data.materials[0]=foliage if i%3 else foliage_light
 ob.parent=root
 ob.matrix_world=Matrix.Translation((x,y,-.08+h*.45))@Matrix.Diagonal((r,r,h*.55,1))

# Low planting inside existing lawn beds, away from circulation and fountain.
points=[(-52,8.7),(-49.5,8.7),(-47,8.7),(-44.5,8.7),(-42,8.7),
 (-52,-1.7),(-51.7,.8),(-49.4,-1.7),(-46.8,-1.7),(-40.5,5.4),
 (-16.7,7.8),(-16.7,5.7),(-16.7,-1),(-29,4.1),(-26.6,4.1),(-24.2,4.1)]
for i,(x,y) in enumerate(points):shrub(x,y,.48+(i%3)*.08,.58+(i%2)*.12,i)

# Thin concentric highlights identify the fountain water without transparency sorting.
water=bpy.data.objects['Fountain_Water_Surface'];center=water.matrix_world.translation
watermat=material('water ripples','7ABCC4',.22,.1)
for i,radius in enumerate([.68,1.12,1.68]):
 name='Fountain_Ripple_%02d'%i
 if bpy.data.objects.get(name):continue
 verts=[];faces=[];segments=80
 for radius2 in [radius-.012,radius+.012]:
  verts.extend((center.x+radius2*math.cos(j*2*math.pi/segments),center.y+radius2*math.sin(j*2*math.pi/segments),center.z+.014) for j in range(segments))
 for j in range(segments):faces.append((j+segments,(j+1)%segments+segments,(j+1)%segments,j))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(watermat)
 ob=bpy.data.objects.new(name,mesh);col.objects.link(ob)

s['quality_revision']='Architectural finish v2: material palette, eased edges, smooth fountains and foliage'
for o in s.objects:
 if o.type!='MESH' or o.hide_render or not o.data.polygons:continue
 zs=[(o.matrix_world@v.co).z for v in o.data.vertices]
 if max(zs)-min(zs)>.00001:continue
 # Horizontal open surfaces face upward; leave closed solids' bottom caps alone.
 if not any((o.matrix_world.to_3x3().inverted().transposed()@p.normal).z<-.9 for p in o.data.polygons):continue
 bm=bmesh.new();bm.from_mesh(o.data)
 bmesh.ops.reverse_faces(bm,faces=[f for f in bm.faces if f.normal.z<-.9])
 bm.to_mesh(o.data);bm.free();o.data.update()
bpy.context.view_layer.update()
json.dump({'materials':list(mapping),'beveled_objects':len(beveled),'low_planting':len(points),'revision':s['quality_revision']},open(folder+'/architectural-polish.json','w'),indent=2)
print('Polished',len(mapping),'materials;',len(beveled),'beveled objects;',len(points),'low shrubs')
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
